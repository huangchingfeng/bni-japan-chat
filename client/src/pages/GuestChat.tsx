import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { createSocket, disconnectSocket } from '../lib/socket';
import { UI_TRANSLATIONS, BNI_QUICK_PHRASES, GUEST_LANG, type Message } from '../../../shared/types';
import { useSpeech } from '../lib/useSpeech';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Guest 資料表單的標籤（固定日文，因為 Guest 是日本人掃 QR Code 進來）
const GUEST_LABELS = {
  title: 'チャットに参加',
  subtitle: 'プロフィールを入力してください',
  name: 'お名前',
  namePlaceholder: 'お名前を入力してください',
  chapter: 'チャプター名',
  chapterPlaceholder: '例：東京チャプター',
  leadership: 'リーダーシップチーム経験',
  leadershipPlaceholder: '例：教育委員長',
  bniYears: 'BNI歴',
  bniYearsPlaceholder: '例：3年',
  submit: 'チャットを始める',
};

interface GuestProfile {
  name: string;
  chapterName: string;
  leadershipRole: string;
  bniYears: string;
}

export default function GuestChat() {
  const { slug } = useParams<{ slug: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [hostName, setHostName] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [isTyping, setIsTyping] = useState(false);
  const [guestProfile, setGuestProfile] = useState<GuestProfile | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPhrases, setShowPhrases] = useState(false);
  const [phraseCategory, setPhraseCategory] = useState(0);

  // 表單 state
  const [formName, setFormName] = useState('');
  const [formChapter, setFormChapter] = useState('');
  const [formLeadership, setFormLeadership] = useState('');
  const [formBniYears, setFormBniYears] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = (key: string) => UI_TRANSLATIONS['ja']?.[key] || key;
  const phrases = BNI_QUICK_PHRASES['ja'];

  const { isListening, isProcessing, isSupported: micSupported, error: speechError, toggleListening, clearError } = useSpeech({
    lang: 'ja',
    onResult: (text) => { setInputText(prev => prev ? `${prev} ${text}` : text); clearError(); },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  useEffect(() => {
    if (!slug) return;

    // 檢查是否有儲存過的 guest profile
    const savedProfile = localStorage.getItem(`guestProfile-${slug}`);
    if (savedProfile) {
      try { setGuestProfile(JSON.parse(savedProfile)); } catch {}
    }

    const init = async () => {
      try {
        const roomRes = await fetch(`/api/chat/${slug}`);
        if (!roomRes.ok) { setRoomNotFound(true); setLoading(false); return; }
        const roomData = await roomRes.json();
        setHostName(roomData.creatorName);

        // 如果 room 已有 guestName 且本地也有 profile，直接進入
        if (roomData.guestName && savedProfile) {
          // 已有資料，不用再填
        } else if (!savedProfile) {
          setShowProfileForm(true);
        }

        const msgRes = await fetch(`/api/chat/${slug}/messages`);
        if (msgRes.ok) { setMessages(await msgRes.json()); }
        setLoading(false);

        // 如果已有 profile，直接連 socket
        if (savedProfile) {
          connectSocket(slug);
        }
      } catch { setRoomNotFound(true); setLoading(false); }
    };

    init();
    return () => {
      disconnectSocket(); socketRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    };
  }, [slug]);

  const connectSocket = (roomSlug: string) => {
    const socket = createSocket({ roomSlug, role: 'guest' });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('room:join', { slug: roomSlug, role: 'guest' });
    });
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.io.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));

    socket.on('message:new', (msg: Message) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id < 0 && m.originalText === msg.originalText && m.sender === msg.sender);
        if (idx !== -1) { const updated = [...prev]; updated[idx] = msg; return updated; }
        return [...prev, msg];
      });
      if (msg.sender === 'host' && msg.id > 0) {
        socket.emit('message:read', { messageIds: [msg.id] });
      }
    });

    socket.on('message:read-ack', (data: { messageIds: number[]; readAt: string }) => {
      setMessages(prev => prev.map(m => data.messageIds.includes(m.id) ? { ...m, readAt: data.readAt } : m));
    });

    const handleHostTyping = (data: { isTyping: boolean }) => {
      setIsTyping(data.isTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (data.isTyping) { typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000); }
    };
    socket.on('host:typing', handleHostTyping);
    socket.on('typing:indicator', (data: { sender: 'host' | 'guest'; isTyping?: boolean }) => {
      if (data.sender === 'host') handleHostTyping({ isTyping: data.isTyping !== false });
    });
  };

  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const chapter = formChapter.trim();
    if (!name || !chapter) return;

    const profile: GuestProfile = {
      name,
      chapterName: chapter,
      leadershipRole: formLeadership.trim() || 'なし',
      bniYears: formBniYears.trim() || '-',
    };

    setGuestProfile(profile);
    setShowProfileForm(false);
    localStorage.setItem(`guestProfile-${slug}`, JSON.stringify(profile));

    // 連線並送完整 profile
    if (slug) {
      connectSocket(slug);
      setTimeout(() => {
        socketRef.current?.emit('guest:setProfile', profile);
      }, 500);
    }
  };

  const handleSend = (e?: FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !socketRef.current) return;
    const optimisticMsg: Message = {
      id: -Date.now(), roomId: 0, sender: 'guest', senderName: guestProfile?.name || null,
      originalText: text, translatedText: null, sourceLang: GUEST_LANG, targetLang: 'zh-TW',
      messageType: 'text', mediaUrl: null, readAt: null, createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    socketRef.current.emit('message:send', { text, sourceLang: GUEST_LANG });
    setInputText(''); setShowPhrases(false); inputRef.current?.focus();
  };

  const handlePhraseClick = (phrase: string) => {
    setInputText(phrase); setShowPhrases(false); inputRef.current?.focus();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (slug) {
      socketRef.current?.emit('typing:start', { roomSlug: slug });
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('typing:stop', { roomSlug: slug });
      }, 1000);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner mx-auto mb-4" />
          <p className="text-gray-500">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Room not found
  if (roomNotFound) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center px-6">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('chatNotFound')}</h2>
          <p className="text-gray-500">{t('linkInvalid')}</p>
        </div>
      </div>
    );
  }

  // Guest Profile Form（掃 QR Code 後第一次進入）
  if (showProfileForm) {
    const L = GUEST_LABELS;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white border-2 border-brand-cyan rounded-2xl mb-4 shadow-sm">
              <span className="text-brand-cyan text-2xl font-bold">AI</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{L.title}</h1>
            <p className="text-gray-500 text-sm mt-1">{L.subtitle}</p>
            {hostName && (
              <p className="text-brand-cyan text-sm mt-2 font-medium">
                チャット相手: {hostName}
              </p>
            )}
          </div>

          <form onSubmit={handleProfileSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{L.name} *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
                placeholder={L.namePlaceholder}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{L.chapter} *</label>
              <input
                type="text"
                value={formChapter}
                onChange={(e) => setFormChapter(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
                placeholder={L.chapterPlaceholder}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{L.leadership}</label>
              <input
                type="text"
                value={formLeadership}
                onChange={(e) => setFormLeadership(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
                placeholder={L.leadershipPlaceholder}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{L.bniYears}</label>
              <input
                type="text"
                value={formBniYears}
                onChange={(e) => setFormBniYears(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
                placeholder={L.bniYearsPlaceholder}
              />
            </div>

            <button
              type="submit"
              disabled={!formName.trim() || !formChapter.trim()}
              className="w-full bg-brand-cyan hover:bg-brand-cyan-dark disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {L.submit}
            </button>
          </form>

          <p className="text-center text-gray-400 text-xs mt-6">
            Powered by <span className="text-brand-cyan">AI峰哥</span> | autolab.cloud
          </p>
        </div>
      </div>
    );
  }

  // Chat 介面
  return (
    <div className="h-dvh flex flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">
              <span className="text-brand-cyan">AI峰哥</span>翻訳チャット
            </h1>
            <p className="text-sm text-gray-500">
              {hostName ? `${t('chatWith')} ${hostName}` : t('loading')}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'reconnecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className="text-xs text-gray-400">{t(connectionStatus)}</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12">
            <div className="text-4xl mb-3">🤝</div>
            <p className="text-sm">{t('startConversation')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('autoTranslated')}</p>
          </div>
        )}

        {messages.map((msg) => {
          const isGuest = msg.sender === 'guest';
          return (
            <div key={msg.id} className={`flex ${isGuest ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] flex flex-col ${isGuest ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2.5 ${
                  isGuest
                    ? 'bg-brand-cyan text-gray-900 rounded-2xl rounded-tr-sm'
                    : 'bg-white text-gray-900 rounded-2xl rounded-tl-sm border border-gray-200 shadow-sm'
                }`}>
                  <p className="text-[15px] leading-relaxed break-words">
                    {isGuest ? msg.originalText : (msg.translatedText || msg.originalText)}
                  </p>
                  {isGuest && msg.translatedText && (
                    <p className="text-xs mt-1 text-gray-900/50 break-words">{msg.translatedText}</p>
                  )}
                  {!isGuest && msg.translatedText && msg.translatedText !== msg.originalText && (
                    <p className="text-xs mt-1 text-gray-400 break-words">{msg.originalText}</p>
                  )}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 px-1 ${isGuest ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                  {isGuest && msg.id > 0 && (
                    <span className={`text-[10px] ${msg.readAt ? 'text-brand-cyan' : 'text-gray-400'}`}>
                      {msg.readAt ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400">{t('typing')}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Phrases Panel */}
      {showPhrases && (
        <div className="bg-white border-t border-gray-200 max-h-[35vh] overflow-hidden flex flex-col">
          <div className="flex overflow-x-auto gap-1 px-3 pt-3 pb-2 flex-shrink-0">
            {phrases.map((cat, i) => (
              <button
                key={i}
                onClick={() => setPhraseCategory(i)}
                className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition ${
                  phraseCategory === i
                    ? 'bg-brand-cyan text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.category}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
            {phrases[phraseCategory].phrases.map((phrase, i) => (
              <button
                key={i}
                onClick={() => handlePhraseClick(phrase)}
                className="w-full text-left text-sm px-3 py-2.5 bg-gray-50 hover:bg-brand-cyan/10 hover:text-brand-cyan text-gray-700 rounded-lg transition"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Speech error toast */}
      {speechError && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-red-600">{speechError}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 text-xs ml-2">✕</button>
        </div>
      )}

      {/* Input bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 safe-area-bottom">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPhrases(!showPhrases)}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
              showPhrases ? 'bg-brand-cyan text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={t('quickPhrases')}
          >
            <span className="text-lg">💬</span>
          </button>

          {micSupported && (
            <button
              type="button"
              onClick={toggleListening}
              disabled={isProcessing}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                isListening ? 'bg-red-500 text-white animate-pulse' :
                isProcessing ? 'bg-yellow-500 text-white animate-pulse' :
                'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="音声入力"
            >
              {isProcessing ? (
                <div className="spinner-sm" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                  <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                </svg>
              )}
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={
              isListening ? '録音中... タップで停止' :
              isProcessing ? '認識中...' :
              t('typeMessage')
            }
            className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 rounded-full px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex-shrink-0 w-10 h-10 bg-brand-cyan hover:bg-brand-cyan-dark disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
            </svg>
          </button>
        </form>

        <p className="text-center text-gray-400 text-[10px] mt-2">
          Powered by <span className="text-brand-cyan">AI峰哥</span> | autolab.cloud
        </p>
      </div>
    </div>
  );
}
