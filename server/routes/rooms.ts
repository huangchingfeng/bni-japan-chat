import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { rooms, messages } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

const router = Router();

// GET /api/rooms?creatorId=xxx — 列出某人建立的房間
router.get('/', (req, res) => {
  const creatorId = req.query.creatorId as string;
  if (!creatorId) {
    res.status(400).json({ message: 'Missing creatorId' });
    return;
  }

  const includeArchived = req.query.includeArchived === 'true';

  const allRooms = includeArchived
    ? db.select().from(rooms)
        .where(eq(rooms.creatorId, creatorId))
        .orderBy(desc(rooms.updatedAt))
        .all()
    : db.select().from(rooms)
        .where(and(eq(rooms.creatorId, creatorId), eq(rooms.status, 'active')))
        .orderBy(desc(rooms.updatedAt))
        .all();

  const result = allRooms.map(room => {
    const lastMsg = db.select().from(messages)
      .where(eq(messages.roomId, room.id))
      .orderBy(desc(messages.createdAt))
      .limit(1)
      .get();

    return {
      ...room,
      chatUrl: `/chat/${room.slug}`,
      lastMessage: lastMsg || null,
    };
  });

  res.json(result);
});

// POST /api/rooms — 建立新房間
router.post('/', (req, res) => {
  const { label, creatorId, creatorName, creatorLang } = req.body;

  if (!label?.trim() || !creatorId || !creatorName) {
    res.status(400).json({ message: '缺少必要欄位' });
    return;
  }

  const slug = nanoid(16);
  const targetLang = creatorLang === 'ja' ? 'zh-TW' : 'ja';

  const result = db.insert(rooms).values({
    slug,
    creatorId,
    label: label.trim(),
    creatorName,
    creatorLang: creatorLang || 'zh-TW',
    guestLang: targetLang,
  }).run();

  const room = db.select().from(rooms).where(eq(rooms.id, Number(result.lastInsertRowid))).get();

  res.status(201).json({
    ...room,
    chatUrl: `/chat/${slug}`,
  });
});

// PATCH /api/rooms/:id/archive — 歸檔或取消歸檔房間
router.patch('/:id/archive', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const creatorId = (req.body.creatorId || req.query.creatorId) as string;

  if (!creatorId) {
    res.status(400).json({ message: 'Missing creatorId' });
    return;
  }

  const room = db.select().from(rooms).where(eq(rooms.id, id)).get();
  if (!room || room.creatorId !== creatorId) {
    res.status(404).json({ message: '找不到此對話' });
    return;
  }

  const newStatus = room.status === 'archived' ? 'active' : 'archived';
  db.update(rooms)
    .set({ status: newStatus, updatedAt: new Date().toISOString() })
    .where(eq(rooms.id, id))
    .run();

  const updated = db.select().from(rooms).where(eq(rooms.id, id)).get();
  res.json(updated);
});

// DELETE /api/rooms/:id — 刪除房間
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const creatorId = req.query.creatorId as string;

  const room = db.select().from(rooms).where(eq(rooms.id, id)).get();
  if (!room || room.creatorId !== creatorId) {
    res.status(404).json({ message: '找不到此對話' });
    return;
  }

  db.delete(messages).where(eq(messages.roomId, id)).run();
  db.delete(rooms).where(eq(rooms.id, id)).run();

  res.status(204).end();
});

// GET /api/rooms/:id/messages — 取得訊息
router.get('/:id/messages', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const room = db.select().from(rooms).where(eq(rooms.id, id)).get();
  if (!room) {
    res.status(404).json({ message: '找不到此對話' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  const msgs = db.select().from(messages)
    .where(eq(messages.roomId, room.id))
    .orderBy(messages.createdAt)
    .limit(limit)
    .offset(offset)
    .all();

  res.json(msgs);
});

export default router;
