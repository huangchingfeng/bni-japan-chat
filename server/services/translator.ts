import { GoogleGenerativeAI } from '@google/generative-ai';
import { LRUCache } from 'lru-cache';
import { getLanguageName } from '../../shared/types.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 翻譯快取：最多 500 筆，TTL 1 小時
const translationCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 60,
});

async function attemptTranslation(
  text: string,
  sourceLangName: string,
  targetLangName: string
): Promise<string> {
  const systemPrompt = `You are a real-time BNI business chat translator. Rules:
1. Translate from ${sourceLangName} to ${targetLangName}
2. Keep the tone polite and professional (business networking context)
3. Preserve emojis, numbers, and proper nouns as-is
4. If already in target language, return unchanged
5. Return ONLY the translated text, no explanations, no quotes
6. For ambiguous phrases, use the most common business/professional meaning
7. BNI-specific terms: referral=リファーラル/引薦, chapter=チャプター/分會, 1-to-1=1to1`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const result = await Promise.race([
    model.generateContent(text),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Translation timeout')), 5000)
    ),
  ]);

  return result.response.text().trim();
}

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (sourceLang === targetLang) return text;
  if (!text || !text.trim()) return text;

  const cacheKey = `${sourceLang}:${targetLang}:${text}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const sourceLangName = getLanguageName(sourceLang);
  const targetLangName = getLanguageName(targetLang);

  try {
    const translated = await attemptTranslation(text, sourceLangName, targetLangName);
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.error('[Translator] First attempt failed:', error);

    // 自動重試 1 次
    try {
      const translated = await attemptTranslation(text, sourceLangName, targetLangName);
      translationCache.set(cacheKey, translated);
      return translated;
    } catch (retryError) {
      console.error('[Translator] Retry also failed:', retryError);
      return text;
    }
  }
}
