import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// POST /api/speech/transcribe — 用 Gemini 辨識語音
router.post('/transcribe', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const audioBuffer = Buffer.concat(chunks);
      if (audioBuffer.length < 100) {
        res.status(400).json({ error: 'No audio data' });
        return;
      }

      const lang = (req.headers['x-language'] as string) || 'ja';
      const langName = lang === 'zh-TW' ? '繁體中文' : '日本語';

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/webm',
            data: audioBuffer.toString('base64'),
          },
        },
        `Transcribe this audio to text. The speaker is speaking ${langName}. Return ONLY the transcribed text, nothing else. No explanations, no quotes, no labels.`,
      ]);

      const text = result.response.text().trim();
      res.json({ text });
    } catch (error) {
      console.error('[Speech] Transcription error:', error);
      res.status(500).json({ error: 'Transcription failed' });
    }
  });
});

export default router;
