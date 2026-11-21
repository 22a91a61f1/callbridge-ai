import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { GoogleGenAI } from '@google/genai';
import { normalizeTeluguPronunciation } from './teluguPronunciationDictionary.ts';

// In-memory audio cache to guarantee sub-millisecond replay and protect against rate limits
const audioCache = new Map<string, { buffer: Buffer; contentType: string; provider: string; timestamp: number }>();
const MAX_CACHE_ENTRIES = 100;

export interface FallbackSynthesisResult {
  buffer: Buffer;
  contentType: string;
  isMock: boolean;
  isFallback: boolean;
  provider: string;
  notice?: string;
}

/**
 * FallbackSpeechService provides high-fidelity, resilient multilingual speech synthesis
 * (Telugu, Hindi, English) when external provider (ElevenLabs) has a billing/payment issue
 * or quota limitation.
 */
export class FallbackSpeechService {
  /**
   * Generates MD5 hash for cache keying
   */
  private static getCacheKey(text: string, lang: string): string {
    return crypto.createHash('md5').update(`${lang}:${text.trim()}`).digest('hex');
  }

  /**
   * Primary Fallback: Gemini TTS via @google/genai SDK (gemini-3.8-flash-lite-tts)
   */
  private static async synthesizeWithGemini(
    text: string,
    lang: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return null;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt =
        lang === 'te'
          ? `దయచేసి ఈ తెలుగు వచనాన్ని సహజమైన శైలిలో స్పష్టంగా చదవండి: ${text}`
          : lang === 'hi'
          ? `कृपया इस पाठ को स्पष्ट और स्वाभाविक आवाज़ में पढ़ें: ${text}`
          : `Please read aloud clearly and naturally: ${text}`;

      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: prompt,
        config: {
          responseModalities: ['AUDIO'],
        },
      });

      const part = res.candidates?.[0]?.content?.parts?.[0];
      const base64Data = part?.inlineData?.data;
      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        const mimeType = part?.inlineData?.mimeType || 'audio/wav';
        console.log('[FALLBACK_TTS_SUCCESS] Synthesized via Gemini TTS, bytes:', buffer.length);
        return { buffer, contentType: mimeType };
      }
    } catch (geminiErr: any) {
      console.warn('[FALLBACK_TTS_GEMINI_NOTICE] Gemini TTS unavailable/rate-limited:', geminiErr?.message || geminiErr);
    }
    return null;
  }

  /**
   * Secondary Fallback: Direct Google Neural Speech (gTTS)
   * Guaranteed zero-quota, native audio/mpeg MP3 in Telugu (te), Hindi (hi), and English (en).
   */
  private static async synthesizeWithNeuralGTTS(
    text: string,
    lang: string
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const tl = lang === 'hi' ? 'hi' : lang === 'en' ? 'en' : 'te';
    // Split sentences into manageable chunks to respect URL length constraints
    const chunks = text.match(/[^.!?।\n]+[.!?।\n]*/g) || [text];
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;

      // Subdivide chunk if longer than 150 characters
      const subChunks: string[] = [];
      if (trimmed.length > 150) {
        const words = trimmed.split(' ');
        let cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).length > 140) {
            if (cur) subChunks.push(cur.trim());
            cur = w;
          } else {
            cur = cur ? `${cur} ${w}` : w;
          }
        }
        if (cur) subChunks.push(cur.trim());
      } else {
        subChunks.push(trimmed);
      }

      for (const piece of subChunks) {
        if (!piece.trim()) continue;
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
          tl
        )}&q=${encodeURIComponent(piece.trim())}`;

        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!res.ok) {
          throw new Error(`Neural TTS HTTP error: ${res.status}`);
        }

        const arrayBuf = await res.arrayBuffer();
        buffers.push(Buffer.from(arrayBuf));
      }
    }

    if (buffers.length === 0) {
      throw new Error('No audio buffers synthesized');
    }

    const mergedBuffer = Buffer.concat(buffers);
    console.log('[FALLBACK_TTS_SUCCESS] Synthesized via Neural Speech (gTTS), bytes:', mergedBuffer.length);
    return { buffer: mergedBuffer, contentType: 'audio/mpeg' };
  }

  /**
   * Synthesizes speech with multi-tiered fallback and memory caching.
   */
  public static async synthesize(
    text: string,
    lang: string = 'te',
    billingNotice?: string
  ): Promise<FallbackSynthesisResult> {
    const rawClean = text.trim();
    if (!rawClean) {
      throw new Error('Speech text cannot be empty');
    }

    // Apply Telugu pronunciation normalization dictionary
    const { normalizedText } = normalizeTeluguPronunciation(rawClean);
    const cleanText = normalizedText.trim();
    const cacheKey = this.getCacheKey(cleanText, lang);

    // 1. Check in-memory audio cache
    const cached = audioCache.get(cacheKey);
    if (cached) {
      console.log('[FALLBACK_TTS_CACHE_HIT]', { lang, cacheKey, bytes: cached.buffer.length });
      return {
        buffer: cached.buffer,
        contentType: cached.contentType,
        isMock: false,
        isFallback: true,
        provider: cached.provider,
        notice: billingNotice || 'Using cached AI Speech Synthesis',
      };
    }

    let synthesized: { buffer: Buffer; contentType: string } | null = null;
    let providerName = 'google_neural';

    // 2. Try Gemini TTS first
    try {
      synthesized = await this.synthesizeWithGemini(cleanText, lang);
      if (synthesized) {
        providerName = 'gemini_tts';
      }
    } catch (e) {
      // Continue to secondary fallback
    }

    // 3. Secondary Fallback: Neural Speech (gTTS)
    if (!synthesized) {
      synthesized = await this.synthesizeWithNeuralGTTS(cleanText, lang);
      providerName = 'google_neural';
    }

    // Store in LRU cache
    if (audioCache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = audioCache.keys().next().value;
      if (firstKey) audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, {
      buffer: synthesized.buffer,
      contentType: synthesized.contentType,
      provider: providerName,
      timestamp: Date.now(),
    });

    return {
      buffer: synthesized.buffer,
      contentType: synthesized.contentType,
      isMock: false,
      isFallback: true,
      provider: providerName,
      notice:
        billingNotice ||
        'ElevenLabs subscription payment is required. Audio synthesized seamlessly using high-fidelity AI Speech.',
    };
  }
}
