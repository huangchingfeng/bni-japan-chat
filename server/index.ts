import 'dotenv/config';

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import roomsRouter from './routes/rooms.js';
import chatRouter from './routes/chat.js';
import { setupSocket } from './socket.js';
import { initDB } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

function getCorsOrigin(): string | string[] {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) return allowedOrigins.split(',').map(s => s.trim());
  if (process.env.NODE_ENV === 'production') return '*';
  return 'http://localhost:5173';
}

// Middleware
app.use(helmet());
app.use(cors({ origin: getCorsOrigin() }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/rooms', roomsRouter);
app.use('/api/chat', chatRouter);

// Production: SPA fallback
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../dist/client');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API route not found' });
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = createServer(app);
setupSocket(server);

const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.warn('[Startup] WARNING: GEMINI_API_KEY is not set. Translation will not work.');
}

await initDB();

server.listen(PORT, () => {
  console.log(`BNI Japan Chat server running on port ${PORT}`);

  // 自動保活：每 14 分鐘 ping 自己，防止 Render 免費方案休眠
  if (process.env.RENDER_EXTERNAL_URL) {
    const url = `${process.env.RENDER_EXTERNAL_URL}/api/health`;
    setInterval(() => {
      fetch(url).catch(() => {});
    }, 14 * 60 * 1000);
    console.log(`[Keep-alive] Pinging ${url} every 14 minutes`);
  }
});
