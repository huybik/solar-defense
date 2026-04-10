/**
 * Web Speech API voice-over engine for cinematic sequences.
 * Falls back gracefully when TTS is unavailable.
 */

const PREFERRED_NAMES = ['Daniel', 'Aaron', 'James', 'Google UK English Male', 'Male'];
const RATE = 0.88;
const PITCH = 0.92;
const VOLUME = 1.0;

export class VoiceEngine {
  private ttsAvailable: boolean;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (!this.ttsAvailable) return;

    this.pickVoice();
    // Chrome loads voices asynchronously
    speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  get supported(): boolean {
    return this.ttsAvailable;
  }

  get needsActivation(): boolean {
    return this.ttsAvailable && !(navigator.userActivation?.hasBeenActive ?? false);
  }

  speak(text: string): Promise<boolean> {
    if (!this.ttsAvailable || this.needsActivation) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = RATE;
      utterance.pitch = PITCH;
      utterance.volume = VOLUME;

      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);
      speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (this.ttsAvailable) speechSynthesis.cancel();
  }

  // ── internal ──────────────────────────────────────────

  private pickVoice(): void {
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return;

    // Try preferred names first
    for (const name of PREFERRED_NAMES) {
      const match = voices.find((v) => v.name.includes(name));
      if (match) { this.voice = match; return; }
    }

    // Any English voice
    const english = voices.find((v) => v.lang.startsWith('en'));
    if (english) { this.voice = english; return; }

    // Anything at all
    this.voice = voices[0];
  }
}
