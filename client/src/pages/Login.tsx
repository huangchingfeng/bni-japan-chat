import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BniProfile, Nationality } from '../../../shared/types';

const LABELS = {
  'zh-TW': {
    title: 'BNI 中日翻譯聊天',
    subtitle: '填寫您的資料開始使用',
    nationality: '國籍',
    tw: '台灣 🇹🇼',
    jp: '日本 🇯🇵',
    chapter: '分會名稱',
    chapterPlaceholder: '例：華豐分會',
    leadership: '領導團隊經歷',
    leadershipPlaceholder: '例：教育委員會主席',
    name: '姓名',
    namePlaceholder: '請輸入您的姓名',
    bniYears: '在 BNI 多久',
    bniYearsPlaceholder: '例：3 年',
    submit: '開始使用',
    noLeadership: '無',
  },
  'ja': {
    title: 'BNI 日中翻訳チャット',
    subtitle: 'プロフィールを入力して始めましょう',
    nationality: '国籍',
    tw: '台湾 🇹🇼',
    jp: '日本 🇯🇵',
    chapter: 'チャプター名',
    chapterPlaceholder: '例：東京チャプター',
    leadership: 'リーダーシップチーム経験',
    leadershipPlaceholder: '例：教育委員長',
    name: 'お名前',
    namePlaceholder: 'お名前を入力してください',
    bniYears: 'BNI歴',
    bniYearsPlaceholder: '例：3年',
    submit: '始める',
    noLeadership: 'なし',
  },
} as const;

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [uiLang, setUiLang] = useState<'zh-TW' | 'ja' | null>(null);
  const [nationality, setNationality] = useState<Nationality | ''>('');
  const [chapterName, setChapterName] = useState('');
  const [leadershipRole, setLeadershipRole] = useState('');
  const [name, setName] = useState('');
  const [bniYears, setBniYears] = useState('');

  // Step 1: 語言選擇
  if (!uiLang) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white border-2 border-brand-cyan rounded-2xl mb-5 shadow-sm">
              <span className="text-brand-cyan text-3xl font-bold">AI</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">BNI Translation Chat</h1>
            <p className="text-gray-500 text-sm mt-2">言語を選択 / 請選擇語言</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => { setUiLang('zh-TW'); setNationality('TW'); }}
              className="w-full bg-white hover:bg-gray-50 border border-gray-200 hover:border-brand-cyan text-gray-900 rounded-2xl px-6 py-5 transition group shadow-sm"
            >
              <span className="text-3xl block mb-2">🇹🇼</span>
              <span className="text-lg font-bold group-hover:text-brand-cyan transition">繁體中文</span>
            </button>

            <button
              onClick={() => { setUiLang('ja'); setNationality('JP'); }}
              className="w-full bg-white hover:bg-gray-50 border border-gray-200 hover:border-brand-cyan text-gray-900 rounded-2xl px-6 py-5 transition group shadow-sm"
            >
              <span className="text-3xl block mb-2">🇯🇵</span>
              <span className="text-lg font-bold group-hover:text-brand-cyan transition">日本語</span>
            </button>
          </div>

          <p className="text-gray-400 text-xs mt-8">
            Powered by <span className="text-brand-cyan">AI峰哥</span> | autolab.cloud
          </p>
        </div>
      </div>
    );
  }

  // Step 2: BNI Profile 表單
  const t = LABELS[uiLang];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nationality || !name.trim() || !chapterName.trim()) return;

    const profile: BniProfile = {
      nationality,
      language: nationality === 'JP' ? 'ja' : 'zh-TW',
      uiLang,
      chapterName: chapterName.trim(),
      leadershipRole: leadershipRole.trim() || t.noLeadership,
      name: name.trim(),
      bniYears: bniYears.trim() || '-',
    };

    localStorage.setItem('bniProfile', JSON.stringify(profile));
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white border-2 border-brand-cyan rounded-2xl mb-4 shadow-sm">
            <span className="text-brand-cyan text-2xl font-bold">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{t.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
          {/* 國籍 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t.nationality}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNationality('TW')}
                className={`py-3 rounded-xl text-sm font-semibold transition ${
                  nationality === 'TW'
                    ? 'bg-brand-cyan text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-600 hover:border-brand-cyan/50'
                }`}
              >
                {t.tw}
              </button>
              <button
                type="button"
                onClick={() => setNationality('JP')}
                className={`py-3 rounded-xl text-sm font-semibold transition ${
                  nationality === 'JP'
                    ? 'bg-brand-cyan text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-600 hover:border-brand-cyan/50'
                }`}
              >
                {t.jp}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.name} *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
              placeholder={t.namePlaceholder}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.chapter} *</label>
            <input
              type="text"
              value={chapterName}
              onChange={(e) => setChapterName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
              placeholder={t.chapterPlaceholder}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.leadership}</label>
            <input
              type="text"
              value={leadershipRole}
              onChange={(e) => setLeadershipRole(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
              placeholder={t.leadershipPlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.bniYears}</label>
            <input
              type="text"
              value={bniYears}
              onChange={(e) => setBniYears(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-cyan focus:border-brand-cyan outline-none placeholder-gray-400"
              placeholder={t.bniYearsPlaceholder}
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !chapterName.trim()}
            className="w-full bg-brand-cyan hover:bg-brand-cyan-dark disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition"
          >
            {t.submit}
          </button>
        </form>

        <button
          onClick={() => setUiLang(null)}
          className="block mx-auto mt-4 text-sm text-gray-400 hover:text-brand-cyan transition"
        >
          ← {uiLang === 'ja' ? '言語選択に戻る' : '重新選擇語言'}
        </button>

        <p className="text-center text-gray-400 text-xs mt-4">
          Powered by <span className="text-brand-cyan">AI峰哥</span> | autolab.cloud
        </p>
      </div>
    </div>
  );
}
