import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Dynamic Audio Normalizer for Synthesized Telugu Speech
 *
 * Requirements:
 * - Normalizes output safely without aggressive compression
 * - Keeps natural vocal dynamics and softness
 * - Prevents sudden loudness jumps (eliminates peaks near 0dB)
 * - Prevents very quiet words from disappearing
 * - Keeps average conversational loudness stable (-16 to -18 LUFS / ~ -17dB RMS)
 * - Avoids clipping and distortion
 * - Preserves authentic human vocal timbre, pitch, and formants
 * - Execution speed: ~80-120ms
 */
export async function normalizeVoiceAudio(inputBuffer: Buffer): Promise<Buffer> {
  if (!inputBuffer || inputBuffer.length === 0) {
    return inputBuffer;
  }

  const tempId = `norm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = os.tmpdir();
  const rawPath = path.join(tempDir, `${tempId}_raw.mp3`);
  const outPath = path.join(tempDir, `${tempId}_out.mp3`);

  try {
    await fs.promises.writeFile(rawPath, inputBuffer);

    /**
     * dynaudnorm (Dynamic Audio Normalizer):
     * - f=150: 150ms Gaussian filter frame length for smooth volume transitions
     * - g=15: maximum Gaussian filter window length
     * - m=10: maximum gain factor (prevents over-amplifying low noise floors)
     * - p=0.9: peak value 0.9 (-0.9 dB true peak limit, preventing clipping)
     * - s=12: compress factor to smoothly tame sudden loud peaks
     */
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawPath,
      '-af', 'dynaudnorm=f=150:g=15:m=10:p=0.9:s=12',
      '-ar', '44100',
      '-ac', '1',
      '-b:a', '128k',
      '-f', 'mp3',
      outPath,
    ]);

    const normalizedBuffer = await fs.promises.readFile(outPath);
    if (normalizedBuffer.length > 0) {
      return normalizedBuffer;
    }
    return inputBuffer;
  } catch (err: any) {
    console.warn('[AUDIO_NORMALIZER_WARN] Normalization fallback to input buffer:', err?.message || err);
    return inputBuffer;
  } finally {
    try {
      if (fs.existsSync(rawPath)) await fs.promises.unlink(rawPath);
      if (fs.existsSync(outPath)) await fs.promises.unlink(outPath);
    } catch {}
  }
}
