import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'bni-japan-chat.db');
const sqlite = new Database(dbPath);

sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export function initTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      creator_id TEXT NOT NULL,
      label TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_lang TEXT DEFAULT 'zh-TW',
      guest_name TEXT,
      guest_lang TEXT DEFAULT 'ja',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      sender TEXT NOT NULL,
      sender_name TEXT,
      original_text TEXT NOT NULL,
      translated_text TEXT,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      media_url TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
    CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms(slug);
    CREATE INDEX IF NOT EXISTS idx_rooms_creator ON rooms(creator_id);
  `);
}

export async function initDB() {
  initTables();
  console.log('[DB] Database initialized (no-auth mode)');
}
