import { useState, useRef, useCallback } from 'react';

// Whisper AI 語音辨識 Hook
// 前端錄音 → 送到 server → OpenAI Whisper API 辨識

interface UseSpeechOptions {
  lang: string; // 'zh-TW' | 'ja'
  onResult: (text: string) => void;
}

export function useSpeech({ lang, onResult }: UseSpeechOptions) {
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const startListening = useCallback(async () => {
    if (!isSupported || isListening) return;

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
        // 停止所有 track
        stream.getTracks().forEach(t => t.stop());

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 100) {
          setIsListening(false);
          return;
        }

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
            if (text?.trim()) onResult(text.trim());
          }
        } catch (err) {
          console.error('[Whisper] Upload error:', err);
        }

        setIsListening(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('[Whisper] Mic access error:', err);
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

  return { isListening, isSupported, toggleListening };
}
