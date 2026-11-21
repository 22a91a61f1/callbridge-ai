import { SupportedLanguage } from '../types';

export function speakText(_text: string, _language: SupportedLanguage = 'Telugu', onEnd?: () => void): boolean {
  // STRICT RULE: No browser speech synthesis, robotic audio, or dummy sounds.
  // Speech is exclusively handled via ElevenLabs cloned voice audio.
  if (onEnd) onEnd();
  return false;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
