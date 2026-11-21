import { ElevenLabsService } from './elevenLabsService.ts';

export interface AdditionalVoiceConfig {
  key: string;
  slotLabel: string;
  voiceId: string;
  elevenLabsUrl: string;
}

export interface VerifiedAdditionalVoice {
  key: string;
  slotLabel: string;
  voiceId: string;
  elevenLabsUrl: string;
  verified: boolean;
  accessible: boolean;
  ttsVerified?: boolean;
  ttsTeluguVerified?: boolean;
  name: string;
  providerName?: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
  verifiedLanguages?: Array<{
    language?: string;
    model_id?: string;
    accent?: string;
    locale?: string;
  }>;
  supportedModels?: string[];
  recommendedModelId: string;
  previewUrl?: string;
  settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  };
  error?: string;
  ttsError?: string;
  checkedAt: string;
}

export const ADDITIONAL_VOICE_CATALOG: AdditionalVoiceConfig[] = [
  {
    key: 'additional_voice_1',
    slotLabel: 'Voice 1',
    voiceId: 'XbJsWNHKtG2BgaDeeCX3',
    elevenLabsUrl: 'https://elevenlabs.io/voices/XbJsWNHKtG2BgaDeeCX3',
  },
  {
    key: 'additional_voice_2',
    slotLabel: 'Voice 2',
    voiceId: 'AX6NBB0ZEKsGATpe5g5a',
    elevenLabsUrl: 'https://elevenlabs.io/voices/AX6NBB0ZEKsGATpe5g5a',
  },
  {
    key: 'additional_voice_3',
    slotLabel: 'Voice 3',
    voiceId: 'AfGQOwNTk8JotVVaad3o',
    elevenLabsUrl: 'https://elevenlabs.io/voices/AfGQOwNTk8JotVVaad3o',
  },
  {
    key: 'additional_voice_4',
    slotLabel: 'Voice 4',
    voiceId: '9dQiWzuJKan0MNO2wA8U',
    elevenLabsUrl: 'https://elevenlabs.io/voices/9dQiWzuJKan0MNO2wA8U',
  },
];

const ADDITIONAL_VOICE_ID_SET = new Set(ADDITIONAL_VOICE_CATALOG.map((v) => v.voiceId));

export function isAdditionalVoiceId(voiceId?: string | null): boolean {
  if (!voiceId || typeof voiceId !== 'string') return false;
  return ADDITIONAL_VOICE_ID_SET.has(voiceId.trim());
}

export function getAdditionalVoiceConfig(voiceId?: string | null): AdditionalVoiceConfig | undefined {
  if (!voiceId || typeof voiceId !== 'string') return undefined;
  const target = voiceId.trim();
  return ADDITIONAL_VOICE_CATALOG.find((v) => v.voiceId === target || v.key === target);
}

// Short-lived cache (10 minutes) for verified ElevenLabs metadata
let cachedCatalog: { timestamp: number; voices: VerifiedAdditionalVoice[] } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchVoiceMetadataFromElevenLabs(
  voiceId: string,
  apiKey: string
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}?with_settings=true`, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
  });
  const text = await res.text().catch(() => '');
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const detail = parsed?.detail?.message || parsed?.message || text || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: detail };
  }
  return { ok: true, status: res.status, data: parsed };
}

async function tryAddSharedVoiceToLibrary(
  voiceId: string,
  apiKey: string
): Promise<{ added: boolean; error?: string }> {
  try {
    // Search ElevenLabs shared-voices library to obtain public_owner_id if this voice is not yet in My Voices
    const searchUrls = [
      `https://api.elevenlabs.io/v1/shared-voices?page_size=20&search=${encodeURIComponent(voiceId)}`,
      `https://api.elevenlabs.io/v1/shared-voices?page_size=100`,
    ];
    for (const url of searchUrls) {
      const res = await fetch(url, { headers: { 'xi-api-key': apiKey } });
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      const voices: any[] = data?.voices || [];
      const match = voices.find((v: any) => v.voice_id === voiceId);
      if (match?.public_owner_id) {
        const addRes = await fetch(
          `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(match.public_owner_id)}/${encodeURIComponent(voiceId)}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ new_name: match.name || `CallBridge_${voiceId.slice(0, 6)}` }),
          }
        );
        if (addRes.ok) {
          return { added: true };
        }
        const addErr = await addRes.text().catch(() => '');
        return { added: false, error: addErr || `HTTP ${addRes.status}` };
      }
    }
  } catch (err: any) {
    return { added: false, error: err?.message || 'Failed searching shared voices' };
  }
  return { added: false, error: 'Voice not found in ElevenLabs shared-voices search' };
}

async function probeDirectTts(
  voiceId: string,
  apiKey: string,
  modelId: string,
  text: string
): Promise<{ ok: boolean; bytes?: number; status?: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.1,
            use_speaker_boost: true,
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let parsed: any = null;
      try {
        parsed = JSON.parse(errText);
      } catch {}
      const detail = parsed?.detail?.message || parsed?.message || errText || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: detail };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: buf.length > 0, bytes: buf.length, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'TTS probe timed out' : (err?.message || 'TTS probe failed') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVerifiedAdditionalVoices(options?: {
  forceRefresh?: boolean;
  probeTts?: boolean;
}): Promise<{ voices: VerifiedAdditionalVoice[]; elevenLabsConfigured: boolean }> {
  const apiKey = ElevenLabsService.getApiKey();
  const nowIso = new Date().toISOString();

  if (
    !options?.forceRefresh &&
    !options?.probeTts &&
    cachedCatalog &&
    Date.now() - cachedCatalog.timestamp < CACHE_TTL_MS
  ) {
    return { voices: cachedCatalog.voices, elevenLabsConfigured: Boolean(apiKey) };
  }

  if (!apiKey) {
    const unverified = ADDITIONAL_VOICE_CATALOG.map((item) => ({
      ...item,
      verified: false,
      accessible: false,
      name: item.slotLabel,
      recommendedModelId: 'eleven_v4_turbo',
      error: 'ELEVENLABS_API_KEY is not configured on the server.',
      checkedAt: nowIso,
    }));
    return { voices: unverified, elevenLabsConfigured: false };
  }

  const results: VerifiedAdditionalVoice[] = [];
  for (const item of ADDITIONAL_VOICE_CATALOG) {
    let metaRes = await fetchVoiceMetadataFromElevenLabs(item.voiceId, apiKey);
    if (!metaRes.ok && metaRes.status === 404) {
      const addAttempt = await tryAddSharedVoiceToLibrary(item.voiceId, apiKey);
      if (addAttempt.added) {
        metaRes = await fetchVoiceMetadataFromElevenLabs(item.voiceId, apiKey);
      }
    }

    const data = metaRes.data;
    const providerName = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : undefined;
    const verifiedLanguages = Array.isArray(data?.verified_languages)
      ? data.verified_languages.map((l: any) => ({
          language: l.language,
          model_id: l.model_id,
          accent: l.accent,
          locale: l.locale,
        }))
      : undefined;
    const supportedModels = Array.isArray(data?.high_quality_base_model_ids)
      ? data.high_quality_base_model_ids
      : undefined;

    const entry: VerifiedAdditionalVoice = {
      key: item.key,
      slotLabel: item.slotLabel,
      voiceId: item.voiceId,
      elevenLabsUrl: item.elevenLabsUrl,
      verified: metaRes.ok,
      accessible: metaRes.ok,
      name: providerName ? `${item.slotLabel} — ${providerName}` : item.slotLabel,
      providerName,
      category: data?.category,
      description: typeof data?.description === 'string' && data.description.trim() ? data.description.trim() : undefined,
      labels: data?.labels && typeof data.labels === 'object' ? data.labels : undefined,
      verifiedLanguages,
      supportedModels,
      recommendedModelId: 'eleven_v4_turbo',
      previewUrl: data?.preview_url || undefined,
      settings: data?.settings
        ? {
            stability: typeof data.settings.stability === 'number' ? data.settings.stability : 0.5,
            similarity_boost: typeof data.settings.similarity_boost === 'number' ? data.settings.similarity_boost : 0.85,
            style: typeof data.settings.style === 'number' ? data.settings.style : 0.15,
            use_speaker_boost: data.settings.use_speaker_boost !== undefined ? Boolean(data.settings.use_speaker_boost) : true,
            speed: typeof data.settings.speed === 'number' ? data.settings.speed : 1.0,
          }
        : undefined,
      error: metaRes.ok ? undefined : metaRes.error,
      checkedAt: new Date().toISOString(),
    };

    if (options?.probeTts) {
      const enProbe = await probeDirectTts(item.voiceId, apiKey, 'eleven_v4_turbo', 'Hello, welcome to CallBridge AI.');
      const teProbe = await probeDirectTts(item.voiceId, apiKey, 'eleven_v4_turbo', 'నమస్కారం అండి.');
      entry.ttsVerified = enProbe.ok;
      entry.ttsTeluguVerified = teProbe.ok;
      if (!enProbe.ok || !teProbe.ok) {
        entry.ttsError = enProbe.error || teProbe.error;
      }
      if (enProbe.ok || teProbe.ok) {
        entry.accessible = true;
      }
    }

    results.push(entry);
  }

  if (!options?.probeTts) {
    cachedCatalog = { timestamp: Date.now(), voices: results };
  }

  return { voices: results, elevenLabsConfigured: true };
}

export function getCachedAdditionalVoice(voiceId?: string | null): VerifiedAdditionalVoice | undefined {
  if (!voiceId || !cachedCatalog) return undefined;
  const target = voiceId.trim();
  return cachedCatalog.voices.find((v) => v.voiceId === target);
}
