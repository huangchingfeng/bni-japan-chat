import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import type { RoomListItem, BniProfile } from '../../../shared/types';
import { UI_TRANSLATIONS } from '../../../shared/types';

function getProfile(): BniProfile | null {
  try {
    const raw = localStorage.getItem('bniProfile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const profile = getProfile();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [qrRoomId, setQrRoomId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedRooms, setArchivedRooms] = useState<RoomListItem[]>([]);

  const uiLang = profile?.uiLang || 'zh-TW';
  const t = (key: string) => UI_TRANSLATIONS[uiLang]?.[key] || UI_TRANSLATIONS['zh-TW']?.[key] || key;
  const creatorId = profile ? `${profile.nationality}-${profile.name}` : '';

  const fetchRooms = async () => {
    if (!creatorId) return;
    try {
      const [activeData, allData] = await Promise.all([
        api.get<RoomListItem[]>(`/rooms?creatorId=${encodeURIComponent(creatorId)}`),
        api.get<RoomListItem[]>(`/rooms?creatorId=${encodeURIComponent(creatorId)}&includeArchived=true`),
      ]);
      setRooms(activeData);
      setArchivedRooms(allData.filter(r => r.status === 'archived'));
    } catch {
      // 忽略
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) { navigate('/login'); return; }
    fetchRooms();
  }, []);

  const handleCreate = async () => {
    const label = newLabel.trim();
    if (!label || !profile) return;
    try {
      const newRoom = await api.post<any>('/rooms', {
        label,
        creatorId,
        creatorName: profile.name,
        creatorLang: profile.language,
      });
      setNewLabel('');
      await fetchRooms();
      // 建立後自動顯示 QR Code
      setQrRoomId(newRoom.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmMsg = uiLang === 'ja'
      ? 'この対話を削除しますか？すべてのメッセージが永久に削除されます。'
      : '確定要刪除此對話？所有訊息將永久刪除。';
    if (!confirm(confirmMsg)) return;
    try {
      await api.delete(`/rooms/${id}?creatorId=${encodeURIComponent(creatorId)}`);
      if (qrRoomId === id) setQrRoomId(null);
      fetchRooms();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleArchive = async (id: number) => {
    try {
      await api.patch(`/rooms/${id}/archive`, { creatorId });
      fetchRooms();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCopy = (slug: string, id: number) => {
    const url = `${window.location.origin}/chat/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem('bniProfile');
    navigate('/login');
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toLocaleDateString(uiLang === 'ja' ? 'ja-JP' : 'zh-TW', { month: 'short', day: 'numeric' });
  };

  const getChatUrl = (slug: string) => `${window.location.origin}/chat/${slug}`;

  const createPlaceholder = uiLang === 'ja'
    ? '対話名を入力（例：田中さん 1to1）'
    : '輸入對話名稱（例：田中先生 1to1）';

  const isJa = uiLang === 'ja';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              <span className="text-brand-cyan">AI峰哥</span>{isJa ? '翻訳チャット' : '翻譯聊天'}
            </h1>
            <p className="text-gray-500 text-xs">
              {profile?.name} | {profile?.chapterName}
            </p>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-700 transition">
            {t('logout') || (isJa ? 'ログアウト' : '登出')}
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* 建立新對話 */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={createPlaceholder}
            className="flex-1 bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400 shadow-sm"
          />
          <button
            onClick={handleCreate}
            disabled={!newLabel.trim()}
            className="bg-brand-cyan hover:bg-brand-cyan-dark disabled:bg-gray-300 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition whitespace-nowrap shadow-sm"
          >
            + {isJa ? '作成' : '建立'}
          </button>
        </div>

        {/* 對話列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="spinner mx-auto" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">🇯🇵🇹🇼</div>
            <p>{isJa ? 'まだ対話がありません。上のボタンで作成してください' : '還沒有對話，點擊上方建立'}</p>
            <p className="text-xs text-gray-400 mt-2">{isJa ? '作成後、QRコードを相手に見せて会話を始めましょう' : '建立後出示 QR Code 給對方掃描即可開始聊天'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                <Link
                  to={`/dashboard/chat/${room.id}`}
                  className="block px-4 py-3 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{room.label}</span>
                        {room.guestName && (
                          <span className="text-xs bg-brand-cyan/10 text-brand-cyan px-2 py-0.5 rounded-full">
                            {room.guestName}
                          </span>
                        )}
                      </div>
                      {room.lastMessage && (
                        <p className="text-sm text-gray-500 truncate mt-1">
                          {room.lastMessage.sender === 'host' ? (isJa ? 'あなた: ' : '你: ') : ''}
                          {room.lastMessage.originalText}
                        </p>
                      )}
                    </div>
                    {room.lastMessage && (
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                        {formatTime(room.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                </Link>

                {/* QR Code 展開區 */}
                {qrRoomId === room.id && (
                  <div className="border-t border-gray-100 px-4 py-5 text-center bg-gray-50">
                    <p className="text-sm text-gray-700 font-medium mb-3">
                      {isJa ? '相手にこのQRコードを見せてください' : '請讓對方掃描此 QR Code'}
                    </p>
                    <div className="inline-block bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <QRCodeSVG
                        value={getChatUrl(room.slug)}
                        size={180}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#0A1628"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-3 break-all px-4">{getChatUrl(room.slug)}</p>
                    <button
                      onClick={() => setQrRoomId(null)}
                      className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition"
                    >
                      {isJa ? '閉じる' : '收起'}
                    </button>
                  </div>
                )}

                <div className="flex border-t border-gray-100">
                  <button
                    onClick={() => setQrRoomId(qrRoomId === room.id ? null : room.id)}
                    className={`flex-1 text-xs py-2 transition ${
                      qrRoomId === room.id
                        ? 'text-brand-cyan bg-brand-cyan/5 font-medium'
                        : 'text-gray-400 hover:text-brand-cyan hover:bg-brand-cyan/5'
                    }`}
                  >
                    📱 QR Code
                  </button>
                  <div className="w-px bg-gray-100" />
                  <button
                    onClick={() => handleCopy(room.slug, room.id)}
                    className="flex-1 text-xs text-gray-400 hover:text-brand-cyan hover:bg-brand-cyan/5 py-2 transition"
                  >
                    {copied === room.id ? (isJa ? 'コピー済!' : '已複製!') : (isJa ? 'リンクコピー' : '複製連結')}
                  </button>
                  <div className="w-px bg-gray-100" />
                  <button
                    onClick={() => handleArchive(room.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 px-3 py-2 transition"
                  >
                    {isJa ? 'アーカイブ' : '歸檔'}
                  </button>
                  <div className="w-px bg-gray-100" />
                  <button
                    onClick={() => handleDelete(room.id)}
                    className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-4 py-2 transition"
                  >
                    {isJa ? '削除' : '刪除'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 已歸檔的房間 */}
        {archivedRooms.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="w-full flex items-center justify-between text-sm text-gray-400 hover:text-gray-600 transition py-2"
            >
              <span>{isJa ? `アーカイブ済み (${archivedRooms.length})` : `已歸檔的房間 (${archivedRooms.length})`}</span>
              <span className="text-xs">{showArchived ? '▲' : '▼'}</span>
            </button>
            {showArchived && (
              <div className="space-y-2 mt-2">
                {archivedRooms.map((room) => (
                  <div
                    key={room.id}
                    className="bg-gray-100 rounded-xl border border-gray-200 overflow-hidden opacity-75"
                  >
                    <Link
                      to={`/dashboard/chat/${room.id}`}
                      className="block px-4 py-3 hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-gray-600 truncate">{room.label}</span>
                          {room.guestName && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full ml-2">
                              {room.guestName}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex border-t border-gray-200">
                      <button
                        onClick={() => handleArchive(room.id)}
                        className="flex-1 text-xs text-gray-500 hover:text-brand-cyan hover:bg-brand-cyan/5 py-2 transition"
                      >
                        {isJa ? 'アーカイブ解除' : '取消歸檔'}
                      </button>
                      <div className="w-px bg-gray-200" />
                      <button
                        onClick={() => handleDelete(room.id)}
                        className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-4 py-2 transition"
                      >
                        {isJa ? '削除' : '刪除'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-gray-400 text-xs mt-8">
          Powered by <a href="https://www.autolab.cloud" target="_blank" rel="noopener" className="text-brand-cyan hover:underline">AI峰哥</a> | autolab.cloud
        </p>
      </div>
    </div>
  );
}
