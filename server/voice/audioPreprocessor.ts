import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface AudioPreprocessResult {
  processedBuffer: Buffer;
  fileName: string;
  mimeType: string;
  originalDurationSeconds: number;
  processedDurationSeconds: number;
  silenceRemovedSeconds: number;
  isNormalized: boolean;
}

/**
 * Validates audio file headers and probes metadata using ffprobe.
 */
export async function probeAudio(filePath: string): Promise<{
  duration: number;
  sampleRate: number;
  channels: number;
  codec: string;
}> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-show_entries', 'stream=codec_name,sample_rate,channels',
      '-of', 'json',
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const stream = data.streams?.[0] || {};
    const format = data.format || {};

    const duration = parseFloat(format.duration || stream.duration || '0');
    const sampleRate = parseInt(stream.sample_rate || '44100', 10);
    const channels = parseInt(stream.channels || '1', 10);
    const codec = stream.codec_name || 'unknown';

    return { duration, sampleRate, channels, codec };
  } catch (err: any) {
    throw new Error(`Invalid audio stream or unreadable format: ${err?.message || err}`);
  }
}

/**
 * Robust voice recording preprocessor for ElevenLabs Voice Cloning:
 * 1. Detects and strips long leading and trailing silence.
 * 2. Removes accidental session pauses and internal dead gaps (>0.5s).
 * 3. Applies broadcast-standard volume normalization (EBU R128 loudnorm) safely without clipping.
 * 4. Preserves authentic human vocal timbre, formants, and natural pitch (NO pitch alteration, NO robotic distortion).
 * 5. Safely converts browser formats (WebM/Opus) into pristine 44.1kHz MP3.
 * 6. Validates byte count and duration to ensure the speaker's true voice identity is learned.
 */
export async function preprocessVoiceRecording(
  inputBuffer: Buffer,
  originalFilename: string,
  originalMimeType: string
): Promise<AudioPreprocessResult> {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error('ఖాలీ ఆడియో రికార్డింగ్ ఫైల్. దయచేసి మైక్రోఫోన్ ఉపయోగించి రికార్డ్ చేయండి.');
  }

  const tempId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = os.tmpdir();
  const rawInputPath = path.join(tempDir, `${tempId}_raw.tmp`);
  const outputPath = path.join(tempDir, `${tempId}_processed.mp3`);

  try {
    // 1. Write incoming buffer to temporary disk location
    await fs.promises.writeFile(rawInputPath, inputBuffer);

    // 2. Validate input with ffprobe
    const probe = await probeAudio(rawInputPath);
    if (probe.duration < 0.5) {
      throw new Error(
        'ఆడియో రికార్డింగ్ చాలా తక్కువగా ఉంది (కనీసం 2-3 సెకన్ల స్పష్టమైన మాటలు ఉండాలి).'
      );
    }

    console.log('[VOICE_PREPROCESS_INPUT]', {
      filename: originalFilename,
      mimeType: originalMimeType,
      inputBytes: inputBuffer.length,
      originalDuration: probe.duration.toFixed(2),
      codec: probe.codec,
      sampleRate: probe.sampleRate,
    });

    /**
     * 3. Construct FFmpeg Audio Filter Graph:
     * - silenceremove (start): trims leading silence (> 0.1s below -45dB)
     * - silenceremove (stop): removes long accidental session gaps (> 0.5s below -45dB)
     * - loudnorm: safe EBU R128 loudness normalization (-16 LUFS, -1.5dB true peak, 11 LRA)
     *   Preserves natural dynamic voice range and eliminates microphone volume discrepancies.
     */
    const audioFilters = [
  'silenceremove=start_periods=1:start_duration=0.15:start_threshold=-45dB:detection=rms',
  'silenceremove=stop_periods=1:stop_duration=0.15:stop_threshold=-45dB:detection=rms',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
].join(',');

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawInputPath,
      '-af', audioFilters,
      '-ar', '44100',
      '-ac', '1',
      '-b:a', '128k',
      '-f', 'mp3',
      outputPath,
    ]);

    // 4. Probe processed output
    const outputProbe = await probeAudio(outputPath);
    const processedBuffer = await fs.promises.readFile(outputPath);

    if (processedBuffer.length === 0 || outputProbe.duration < 0.5) {
      // If excessive silence removal left nothing (e.g. whisper or low volume recording),
      // perform a safer gentle normalization pass without aggressive silence stripping
      console.warn('[VOICE_PREPROCESS_FALLBACK] Aggressive silence strip yielded short audio; performing gentle pass.');
      const fallbackFilters = [
        'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-40dB:detection=rms',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
      ].join(',');

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', rawInputPath,
        '-af', fallbackFilters,
        '-ar', '44100',
        '-ac', '1',
        '-b:a', '128k',
        '-f', 'mp3',
        outputPath,
      ]);

      const fallbackProbe = await probeAudio(outputPath);
      const fallbackBuffer = await fs.promises.readFile(outputPath);

      const silenceRemoved = Math.max(0, probe.duration - fallbackProbe.duration);

      console.log('[VOICE_PREPROCESS_SUCCESS_FALLBACK]', {
        originalDuration: probe.duration.toFixed(2),
        processedDuration: fallbackProbe.duration.toFixed(2),
        silenceRemoved: silenceRemoved.toFixed(2),
        processedBytes: fallbackBuffer.length,
      });

      return {
        processedBuffer: fallbackBuffer,
        fileName: 'processed_user_voice.mp3',
        mimeType: 'audio/mpeg',
        originalDurationSeconds: probe.duration,
        processedDurationSeconds: fallbackProbe.duration,
        silenceRemovedSeconds: silenceRemoved,
        isNormalized: true,
      };
    }

    const silenceRemoved = Math.max(0, probe.duration - outputProbe.duration);

    console.log('[VOICE_PREPROCESS_SUCCESS]', {
      originalDuration: probe.duration.toFixed(2),
      processedDuration: outputProbe.duration.toFixed(2),
      silenceRemoved: silenceRemoved.toFixed(2),
      processedBytes: processedBuffer.length,
    });

    return {
      processedBuffer,
      fileName: 'processed_user_voice.mp3',
      mimeType: 'audio/mpeg',
      originalDurationSeconds: probe.duration,
      processedDurationSeconds: outputProbe.duration,
      silenceRemovedSeconds: silenceRemoved,
      isNormalized: true,
    };
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(rawInputPath)) await fs.promises.unlink(rawInputPath);
      if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
    } catch {}
  }
}
