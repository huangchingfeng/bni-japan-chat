// ===== BNI Profile =====

export type Nationality = 'TW' | 'JP';

export interface BniProfile {
  nationality: Nationality;
  language: string; // zh-TW or ja
  uiLang: string; // 介面語言
  chapterName: string;
  leadershipRole: string;
  name: string;
  bniYears: string;
}

// 國籍 → 語言對應
export const NATIONALITY_LANG: Record<Nationality, string> = {
  TW: 'zh-TW',
  JP: 'ja',
};

// ===== Database Models =====

export interface Room {
  id: number;
  slug: string;
  creatorId: string;
  label: string;
  creatorName: string;
  creatorLang: string;
  guestName: string | null;
  guestLang: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  roomId: number;
  sender: 'host' | 'guest';
  senderName: string | null;
  originalText: string;
  translatedText: string | null;
  sourceLang: string;
  targetLang: string;
  messageType: 'text';
  mediaUrl: string | null;
  readAt: string | null;
  createdAt: string;
  translationFailed?: boolean;
}

// ===== API Types =====

export interface RoomListItem extends Room {
  chatUrl: string;
  lastMessage: Message | null;
}

// ===== WebSocket Events =====

export interface GuestProfileData {
  name: string;
  chapterName: string;
  leadershipRole: string;
  bniYears: string;
}

export interface TranslatedGuestProfile {
  original: GuestProfileData;
  translated: GuestProfileData;
}

export interface ClientToServerEvents {
  'room:join': (data: { slug: string; role: 'host' | 'guest' }) => void;
  'message:send': (data: { text: string; sourceLang: string }) => void;
  'message:read': (data: { messageIds: number[] }) => void;
  'typing:start': (data: { roomSlug: string }) => void;
  'typing:stop': (data: { roomSlug: string }) => void;
  'guest:setName': (data: { name: string }) => void;
  'guest:setProfile': (data: GuestProfileData) => void;
}

export interface ServerToClientEvents {
  'room:joined': (data: { roomId: number; hostLang: string; guestLang: string }) => void;
  'message:new': (data: Message) => void;
  'message:error': (data: { error: string }) => void;
  'message:read-ack': (data: { messageIds: number[]; readAt: string }) => void;
  'typing:indicator': (data: { sender: 'host' | 'guest'; isTyping: boolean }) => void;
  'host:typing': (data: { isTyping: boolean }) => void;
  'guest:typing': (data: { isTyping: boolean }) => void;
  'guest:online': (data: { isOnline: boolean }) => void;
  'guest:profile': (data: TranslatedGuestProfile) => void;
  'user:online': (data: { role: string }) => void;
  'user:offline': (data: { role: string }) => void;
}

// ===== Language Config（只支援中文 <-> 日文）=====

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文', flag: '🇹🇼' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
];

// Host 固定中文，Guest 固定日文
export const HOST_LANG = 'zh-TW';
export const GUEST_LANG = 'ja';

// UI 多語系翻譯
export const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  'zh-TW': {
    chatWith: '與',
    yourName: '您的名字',
    enterName: '請輸入您的名字',
    confirm: '確定',
    online: '在線',
    offline: '離線',
    typeMessage: '輸入訊息...',
    startConversation: '開始對話吧！',
    autoTranslated: '訊息會自動翻譯為日文',
    chatNotFound: '找不到聊天室',
    linkInvalid: '此連結可能無效或已過期',
    loading: '載入中...',
    connected: '已連線',
    reconnecting: '重新連線中',
    disconnected: '已斷線',
    typing: '正在輸入',
    quickPhrases: '常用語',
    sendMessage: '發送',
    roomTitle: 'BNI 商務對話',
    createRoom: '建立對話',
    dashboard: '對話管理',
    login: '登入',
    logout: '登出',
    noRooms: '還沒有對話，點擊上方建立',
    roomName: '對話名稱',
    copyLink: '複製連結',
    delete: '刪除',
    guestOffline: '對方離線',
    guestOnline: '對方在線',
  },
  'ja': {
    chatWith: 'チャット相手:',
    yourName: 'お名前',
    enterName: 'お名前を入力してください',
    confirm: 'OK',
    online: 'オンライン',
    offline: 'オフライン',
    typeMessage: 'メッセージを入力...',
    startConversation: '会話を始めましょう！',
    autoTranslated: 'メッセージは自動的に中国語に翻訳されます',
    chatNotFound: 'チャットが見つかりません',
    linkInvalid: 'このリンクは無効または期限切れの可能性があります',
    loading: '読み込み中...',
    connected: '接続済み',
    reconnecting: '再接続中',
    disconnected: '切断されました',
    typing: '入力中',
    quickPhrases: 'よく使うフレーズ',
    sendMessage: '送信',
  },
};

// BNI 商務常用語（Gemini 查到的 + 額外補充）
export const BNI_QUICK_PHRASES = {
  'zh-TW': [
    { category: '自我介紹', phrases: [
      '您好，我是阿峰老師，專門做企業 AI 培訓。',
      '很高興認識您，請多多指教。',
      '我的專業是幫助企業導入 AI 工具。',
    ]},
    { category: '詢問對方', phrases: [
      '能否介紹一下您的業務？',
      '您目前最需要什麼樣的引薦？',
      '最近有特別主力的服務嗎？',
    ]},
    { category: '合作意願', phrases: [
      '我覺得我們有合作的機會。',
      '我想介紹一個人給您認識。',
      '下次找時間一對一聊聊？',
    ]},
    { category: '感謝引薦', phrases: [
      '非常感謝您的引薦！',
      '這個引薦對我幫助很大。',
      '有任何我可以幫忙的請告訴我。',
    ]},
  ],
  'ja': [
    { category: '自己紹介', phrases: [
      'はじめまして、企業AI研修の専門家です。',
      'お会いできて嬉しいです。よろしくお願いいたします。',
      '企業のAIツール導入をサポートしています。',
    ]},
    { category: '相手について', phrases: [
      '貴社の事業内容について教えていただけますか？',
      'どのようなリファーラルをお探しですか？',
      '最近、特に力を入れているサービスはありますか？',
    ]},
    { category: '協力', phrases: [
      '私たちのビジネスにシナジーがありそうですね。',
      'ご紹介したい方がいるのですが。',
      '次回の1to1でぜひ詳しくお聞かせください。',
    ]},
    { category: '感謝', phrases: [
      '素晴らしいリファーラルをありがとうございます。',
      'とても助かりました。',
      '何かお手伝いできることがあればお知らせください。',
    ]},
  ],
};

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.nativeName ?? code;
}

export function getLanguageFlag(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
}
