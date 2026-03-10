import { useState, useRef, useCallback } from 'react';

// Gemini 語音辨識 Hook
// 前端錄音 → 送到 server → Gemini API 辨識

interface UseSpeechOptions {
  lang: string; // 'zh-TW' | 'ja'
  onResult: (text: string) => void;
}

export function useSpeech({ lang, onResult }: UseSpeechOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const startListening = useCallback(async () => {
    if (!isSupported || isListening) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 100) {
          setIsListening(false);
          return;
        }

        setIsListening(false);
        setIsProcessing(true);

        try {
          const response = await fetch('/api/speech/transcribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Language': lang,
            },
            body: audioBlob,
          });

          if (response.ok) {
            const { text } = await response.json();
            if (text?.trim()) {
              onResult(text.trim());
            } else {
              setError(lang === 'ja' ? '音声を認識できませんでした' : '無法辨識語音');
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.error === 'audio_too_short') {
              setError('録音が短すぎます / 錄音太短了');
            } else {
              setError(lang === 'ja' ? '音声認識に失敗しました' : '語音辨識失敗');
            }
          }
        } catch (err) {
          console.error('[Speech] Upload error:', err);
          setError(lang === 'ja' ? 'ネットワークエラー' : '網路錯誤');
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('[Speech] Mic access error:', err);
      setError(lang === 'ja' ? 'マイクへのアクセスが拒否されました' : '麥克風存取被拒絕');
      setIsListening(false);
    }
  }, [lang, onResult, isSupported, isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => setError(null), []);

  return { isListening, isProcessing, isSupported, error, toggleListening, clearError };
}
