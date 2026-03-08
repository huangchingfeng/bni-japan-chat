import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { createSocket, disconnectSocket } from '../lib/socket';
import { api } from '../lib/api';
import { UI_TRANSLATIONS, BNI_QUICK_PHRASES, type Message, type Room, type BniProfile, type TranslatedGuestProfile } from '../../../shared/types';
import { useSpeech } from '../lib/useSpeech';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getProfile(): BniProfile | null {
  try {
    const raw = localStorage.getItem('bniProfile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function HostChat() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const profile = getProfile();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [guestOnline, setGuestOnline] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);
  const [phraseCategory, setPhraseCategory] = useState(0);
  const [guestProfileCard, setGuestProfileCard] = useState<TranslatedGuestProfile | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uiLang = profile?.uiLang || 'zh-TW';
  const t = (key: string) => UI_TRANSLATIONS[uiLang]?.[key] || UI_TRANSLATIONS['zh-TW']?.[key] || key;
  const phrases = BNI_QUICK_PHRASES[uiLang] || BNI_QUICK_PHRASES['zh-TW'];
  const creatorId = profile ? `${profile.nationality}-${profile.name}` : '';

  const { isListening, isSupported: micSupported, toggleListening } = useSpeech({
    lang: profile?.language || 'zh-TW',
    onResult: (text) => setInputText(prev => prev ? `${prev} ${text}` : text),
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  useEffect(() => {
    if (!roomId || !profile) return;

    const init = async () => {
      try {
        const allRooms = await api.get<any[]>(`/rooms?creatorId=${encodeURIComponent(creatorId)}`);
        const currentRoom = allRooms.find(r => r.id === parseInt(roomId, 10));
        if (!currentRoom) { navigate('/dashboard'); return; }
        setRoom(currentRoom);

        const msgs = await api.get<Message[]>(`/rooms/${roomId}/messages`);
        setMessages(msgs);

        const socket = createSocket({ roomSlug: currentRoom.slug, role: 'host' });
        socketRef.current = socket;

        socket.on('connect', () => {
          setConnectionStatus('connected');
          socket.emit('room:join', { slug: currentRoom.slug, role: 'host' });
        });
        socket.on('disconnect', () => setConnectionStatus('disconnected'));
        socket.io.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));

        socket.on('message:new', (msg: Message) => {
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id < 0 && m.originalText === msg.originalText && m.sender === msg.sender);
            if (idx !== -1) { const updated = [...prev]; updated[idx] = msg; return updated; }
            return [...prev, msg];
          });
          if (msg.sender === 'guest' && msg.id > 0) {
            socket.emit('message:read', { messageIds: [msg.id] });
          }
        });

        socket.on('message:read-ack', (data: { messageIds: number[]; readAt: string }) => {
          setMessages(prev => prev.map(m => data.messageIds.includes(m.id) ? { ...m, readAt: data.readAt } : m));
        });

        socket.on('guest:online', (data: { isOnline: boolean }) => setGuestOnline(data.isOnline));
        socket.on('guest:profile', (data: TranslatedGuestProfile) => {
          setGuestProfileCard(data);
          if (data.translated?.name) {
            setRoom(prev => prev ? { ...prev, guestName: data.translated.name } : prev);
          }
        });

        const handleGuestTyping = (data: { isTyping: boolean }) => {
          setIsTyping(data.isTyping);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          if (data.isTyping) { typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000); }
        };
        socket.on('guest:typing', handleGuestTyping);
        socket.on('typing:indicator', (data: { sender: 'host' | 'guest'; isTyping?: boolean }) => {
          if (data.sender === 'guest') handleGuestTyping({ isTyping: data.isTyping !== false });
        });
      } catch { navigate('/dashboard'); }
    };

    init();
    return () => {
      disconnectSocket(); socketRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    };
  }, [roomId]);

  const handleSend = (e?: FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !socketRef.current) return;
    const sourceLang = profile?.language || 'zh-TW';
    const targetLang = sourceLang === 'zh-TW' ? 'ja' : 'zh-TW';
    const optimisticMsg: Message = {
      id: -Date.now(), roomId: 0, sender: 'host', senderName: profile?.name || null,
      originalText: text, translatedText: null, sourceLang, targetLang,
      messageType: 'text', mediaUrl: null, readAt: null, createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    socketRef.current.emit('message:send', { text, sourceLang });
    setInputText(''); setShowPhrases(false); inputRef.current?.focus();
  };

  const handlePhraseClick = (phrase: string) => {
    setInputText(phrase); setShowPhrases(false); inputRef.current?.focus();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (room) {
      socketRef.current?.emit('typing:start', { roomSlug: room.slug });
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('typing:stop', { roomSlug: room.slug });
      }, 1000);
    }
  };

  return (
    <div className="h-dvh flex flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-700 transition">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">{room?.label || t('loading')}</h1>
              <div className="flex items-center gap-2 text-sm">
                {room?.guestName && <span className="text-gray-500">{room.guestName}</span>}
                <span className={`inline-block w-2 h-2 rounded-full ${guestOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-gray-400 text-xs">{guestOnline ? t('guestOnline') : t('guestOffline')}</span>
              </div>
            </div>
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
        {/* Guest Profile Card */}
        {guestProfileCard && (
          <div className="bg-gradient-to-r from-brand-cyan/10 to-blue-50 border border-brand-cyan/20 rounded-2xl p-4 mb-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🇯🇵</span>
              <span className="font-bold text-gray-900">{guestProfileCard.translated.name}</span>
              <span className="text-xs text-gray-400">({guestProfileCard.original.name})</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400 text-xs">分會</span>
                <p className="text-gray-700">{guestProfileCard.translated.chapterName}</p>
                <p className="text-[10px] text-gray-400">{guestProfileCard.original.chapterName}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">BNI 年資</span>
                <p className="text-gray-700">{guestProfileCard.translated.bniYears}</p>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400 text-xs">領導團隊職位</span>
                <p className="text-gray-700">{guestProfileCard.translated.leadershipRole}</p>
                <p className="text-[10px] text-gray-400">{guestProfileCard.original.leadershipRole}</p>
              </div>
            </div>
          </div>
        )}

        {messages.length === 0 && !guestProfileCard && (
          <div className="text-center text-gray-400 mt-12">
            <div className="text-4xl mb-3">🤝</div>
            <p className="text-sm">{t('startConversation')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('autoTranslated')}</p>
          </div>
        )}

        {messages.length === 0 && guestProfileCard && (
          <div className="text-center text-gray-400 mt-4">
            <p className="text-xs">{t('autoTranslated')}</p>
          </div>
        )}

        {messages.map((msg) => {
          const isHost = msg.sender === 'host';
          return (
            <div key={msg.id} className={`flex ${isHost ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] flex flex-col ${isHost ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2.5 ${
                  isHost
                    ? 'bg-brand-cyan text-gray-900 rounded-2xl rounded-tr-sm'
                    : 'bg-white text-gray-900 rounded-2xl rounded-tl-sm border border-gray-200 shadow-sm'
                }`}>
                  <p className="text-[15px] leading-relaxed break-words">
                    {isHost ? msg.originalText : (msg.translatedText || msg.originalText)}
                  </p>
                  {isHost && msg.translatedText && (
                    <p className="text-xs mt-1 text-gray-900/50 break-words">{msg.translatedText}</p>
                  )}
                  {!isHost && msg.translatedText && msg.translatedText !== msg.originalText && (
                    <p className="text-xs mt-1 text-gray-400 break-words">{msg.originalText}</p>
                  )}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 px-1 ${isHost ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                  {isHost && msg.id > 0 && (
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
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={uiLang === 'ja' ? '音声入力' : '語音輸入'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
              </svg>
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={isListening ? (uiLang === 'ja' ? '聞いています...' : '聆聽中...') : t('typeMessage')}
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
      </div>
    </div>
  );
}
