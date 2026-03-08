import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').unique().notNull(),
  creatorId: text('creator_id').notNull(),
  label: text('label').notNull(),
  creatorName: text('creator_name').notNull(),
  creatorLang: text('creator_lang').default('zh-TW'),
  guestName: text('guest_name'),
  guestLang: text('guest_lang').default('ja'),
  status: text('status').default('active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id),
  sender: text('sender').notNull(),
  senderName: text('sender_name'),
  originalText: text('original_text').notNull(),
  translatedText: text('translated_text'),
  sourceLang: text('source_lang').notNull(),
  targetLang: text('target_lang').notNull(),
  messageType: text('message_type').default('text'),
  mediaUrl: text('media_url'),
  readAt: text('read_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
