import { Router } from 'express';
import { db } from '../db/index.js';
import { rooms, messages } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/chat/:slug — 取得聊天室資訊（公開）
router.get('/:slug', (req, res) => {
  const { slug } = req.params;

  const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();
  if (!room) {
    res.status(404).json({ message: 'チャットが見つかりません' });
    return;
  }

  res.json({
    slug: room.slug,
    creatorName: room.creatorName,
    creatorLang: room.creatorLang,
    guestName: room.guestName,
    guestLang: room.guestLang,
    label: room.label,
  });
});

// GET /api/chat/:slug/messages — 取得聊天訊息（公開）
router.get('/:slug/messages', (req, res) => {
  const { slug } = req.params;

  const room = db.select().from(rooms).where(eq(rooms.slug, slug)).get();
  if (!room) {
    res.status(404).json({ message: 'チャットが見つかりません' });
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
