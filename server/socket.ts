import { Server } from 'socket.io';
import { db } from './db/index.js';
import { rooms, messages } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { translate } from './services/translator.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';

const roomConnections = new Map<string, { host?: string; guest?: string }>();
const socketRooms = new Map<string, { slug: string; role: 'host' | 'guest' }>();
const rateLimits = new Map<string, number[]>();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1000;
const MAX_MESSAGE_LENGTH = 2000;

function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimits.get(socketId) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  recent.push(now);
  rateLimits.set(socketId, recent);
  return recent.length <= RATE_LIMIT_MAX;
}

export function setupSocket(httpServer: any): void {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Socket.io 連線驗證（無需 JWT，只需 roomSlug + role）
  io.use((socket, next) => {
    const { roomSlug, role } = socket.handshake.auth;

    if (!roomSlug) {
      return next(new Error('缺少 roomSlug'));
    }

    const room = db.select().from(rooms).where(eq(rooms.slug, roomSlug)).get();
    if (!room) {
      return next(new Error('チャットが見つかりません'));
    }

    (socket.data as any).role = role || 'guest';
    (socket.data as any).roomSlug = roomSlug;
    return next();
  });

  io.on('connection', (socket) => {
    const authenticatedRole: 'host' | 'guest' = (socket.data as any).role;
    console.log(`[Socket] Connected: ${socket.id} (${authenticatedRole})`);

    // room:join
    socket.on('room:join', async ({ slug }) => {
      const role = authenticatedRole;

      try {
        const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();
        if (!room) {
          socket.emit('message:error', { error: '聊天室不存在' });
          return;
        }

        socket.join(slug);

        const conn = roomConnections.get(slug) || {};
        conn[role] = socket.id;
        roomConnections.set(slug, conn);
        socketRooms.set(socket.id, { slug, role });

        socket.emit('room:joined', {
          roomId: room.id,
          hostLang: room.creatorLang || 'zh-TW',
          guestLang: room.guestLang || 'ja',
        });

        socket.to(slug).emit('user:online', { role });

        if (role === 'guest') {
          io.to(slug).emit('guest:online', { isOnline: true });
        }

        console.log(`[Socket] ${role} joined room: ${slug}`);
      } catch (error) {
        console.error('[Socket] room:join error:', error);
        socket.emit('message:error', { error: '加入聊天室失敗' });
      }
    });

    // message:send
    socket.on('message:send', async ({ text, sourceLang }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        socket.emit('message:error', { error: `訊息長度不得超過 ${MAX_MESSAGE_LENGTH} 字元` });
        return;
      }

      if (!checkRateLimit(socket.id)) {
        socket.emit('message:error', { error: '發送太頻繁，請稍候' });
        return;
      }

      const { slug, role } = info;

      try {
        const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();
        if (!room) return;

        const actualSourceLang = sourceLang || (role === 'host' ? 'zh-TW' : 'ja');
        const targetLang = role === 'host' ? 'ja' : 'zh-TW';

        const translatedText = await translate(text, actualSourceLang, targetLang);

        const result = db.insert(messages).values({
          roomId: room.id,
          sender: role,
          originalText: text,
          translatedText,
          sourceLang: actualSourceLang,
          targetLang,
          messageType: 'text',
        }).run();

        db.update(rooms)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(rooms.id, room.id))
          .run();

        const insertedId = Number(result.lastInsertRowid);
        const inserted = db.select().from(messages).where(eq(messages.id, insertedId)).get();

        if (inserted) {
          io.to(slug).emit('message:new', inserted as any);
        }
      } catch (error) {
        console.error('[Socket] message:send error:', error);
        socket.emit('message:error', { error: '訊息發送失敗，請重試' });
      }
    });

    // guest:setName
    socket.on('guest:setName', async ({ name }) => {
      const info = socketRooms.get(socket.id);
      if (!info || info.role !== 'guest') return;

      try {
        db.update(rooms)
          .set({ guestName: name, updatedAt: new Date().toISOString() })
          .where(eq(rooms.slug, info.slug))
          .run();
      } catch (error) {
        console.error('[Socket] guest:setName error:', error);
      }
    });

    // guest:setProfile — Guest 送完整 BNI 資料，翻譯後轉給 Host
    socket.on('guest:setProfile', async (profileData) => {
      const info = socketRooms.get(socket.id);
      if (!info || info.role !== 'guest') return;

      try {
        // 更新 guestName
        db.update(rooms)
          .set({ guestName: profileData.name, updatedAt: new Date().toISOString() })
          .where(eq(rooms.slug, info.slug))
          .run();

        // 翻譯 profile（日文 → 中文）
        const fieldsToTranslate = [
          profileData.name,
          profileData.chapterName,
          profileData.leadershipRole,
          profileData.bniYears,
        ].join(' | ');

        const translated = await translate(fieldsToTranslate, 'ja', 'zh-TW');
        const parts = translated.split('|').map(s => s.trim());

        const translatedProfile = {
          name: parts[0] || profileData.name,
          chapterName: parts[1] || profileData.chapterName,
          leadershipRole: parts[2] || profileData.leadershipRole,
          bniYears: parts[3] || profileData.bniYears,
        };

        // 發送給 Host
        socket.to(info.slug).emit('guest:profile', {
          original: profileData,
          translated: translatedProfile,
        });

        console.log(`[Socket] Guest profile sent to host in room: ${info.slug}`);
      } catch (error) {
        console.error('[Socket] guest:setProfile error:', error);
      }
    });

    // message:read
    socket.on('message:read', ({ messageIds }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      const now = new Date().toISOString();
      try {
        for (const id of messageIds) {
          db.update(messages).set({ readAt: now }).where(eq(messages.id, id)).run();
        }
        socket.to(info.slug).emit('message:read-ack', { messageIds, readAt: now });
      } catch (error) {
        console.error('[Socket] message:read error:', error);
      }
    });

    // typing
    socket.on('typing:start', ({ roomSlug }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;
      const slug = roomSlug || info.slug;
      socket.to(slug).emit('typing:indicator', { sender: info.role, isTyping: true });
      if (info.role === 'host') {
        socket.to(slug).emit('host:typing', { isTyping: true });
      } else {
        socket.to(slug).emit('guest:typing', { isTyping: true });
      }
    });

    socket.on('typing:stop', ({ roomSlug }) => {
      const info = socketRooms.get(socket.id);
      if (!info) return;
      const slug = roomSlug || info.slug;
      socket.to(slug).emit('typing:indicator', { sender: info.role, isTyping: false });
      if (info.role === 'host') {
        socket.to(slug).emit('host:typing', { isTyping: false });
      } else {
        socket.to(slug).emit('guest:typing', { isTyping: false });
      }
    });

    // disconnect
    socket.on('disconnect', () => {
      const info = socketRooms.get(socket.id);
      if (!info) return;

      const { slug, role } = info;

      const conn = roomConnections.get(slug);
      if (conn) {
        if (conn[role] === socket.id) delete conn[role];
        if (!conn.host && !conn.guest) roomConnections.delete(slug);
      }

      socketRooms.delete(socket.id);
      rateLimits.delete(socket.id);

      io.to(slug).emit('user:offline', { role });

      if (role === 'guest') {
        io.to(slug).emit('guest:online', { isOnline: false });
      }

      console.log(`[Socket] ${role} left room: ${slug}`);
    });
  });
}
