# BNI Japan Chat
BNI 中日商務翻譯聊天 — 台灣 BNI 會員（中文）與日本 BNI 會員（日文）1 對 1 即時翻譯對話。

## 技術棧
- Frontend: Vite 6 + React 19 + TailwindCSS
- Backend: Express 4 + Socket.io 4 + TypeScript
- DB: SQLite (better-sqlite3) + Drizzle ORM
- Translation: Google Gemini API (gemini-2.0-flash)
- Auth: 無帳號系統，BNI Profile 存 localStorage

## 開發指令
```bash
npm run dev         # 同時啟動前後端
npm run dev:server  # 只啟動後端 (port 3000)
npm run dev:client  # 只啟動前端 (port 5173)
npm run build       # 建置
npm start           # production
```

## 部署
- Render.com / Fly.io / Docker
- 設定環境變數：GEMINI_API_KEY

## 特色功能
- 無需登入，填 BNI Profile（國籍、姓名、分會、領導經歷、BNI年資）即可使用
- 支援中日雙語介面切換
- 固定語言對：zh-TW ↔ ja
- BNI 商務常用語快速選單（中/日雙語）
- 翻譯引擎針對 BNI 商務用語優化（referral/chapter/1to1 等術語）
- Autolab CVI 品牌視覺（Electric Cyan #00D4FF + Deep Navy #0A1628）
