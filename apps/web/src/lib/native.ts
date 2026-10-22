// Wrapper around the Fire TV shell's `NaniNative` JS bridge.
// In a desktop/phone browser the bridge is absent, so we fall back to
// speechSynthesis (or a console log).

interface NaniNativeBridge {
  speak(text: string, lang: string): void;
  stopSpeaking(): void;
  ttsLanguages(): string;
  exitApp(): void;
}

declare global {
  interface Window {
    NaniNative?: NaniNativeBridge;
  }
}

export type Lang = 'hi' | 'en';

const bcp47 = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');

export const isOnTv = () => typeof window !== 'undefined' && !!window.NaniNative;

export function speak(text: string, lang: Lang = 'hi') {
  if (window.NaniNative) {
    window.NaniNative.speak(text, bcp47(lang));
    return;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } else {
    console.log('[speak]', lang, text);
  }
}

export function stopSpeaking() {
  if (window.NaniNative) window.NaniNative.stopSpeaking();
  else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function ttsLanguages(): string[] {
  if (window.NaniNative) {
    try {
      return JSON.parse(window.NaniNative.ttsLanguages());
    } catch {
      return [];
    }
  }
  if ('speechSynthesis' in window) {
    return Array.from(new Set(window.speechSynthesis.getVoices().map((v) => v.lang)));
  }
  return [];
}

export function exitApp() {
  if (window.NaniNative) window.NaniNative.exitApp();
  else console.log('[exitApp] (no native bridge)');
}

/** Subscribe to the Fire TV Back key (dispatched by the shell as `nani-back`). */
export function onBack(handler: () => void): () => void {
  const onNaniBack = () => handler();
  // Desktop testing: Escape / Backspace act as Back.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault();
      handler();
    }
  };
  window.addEventListener('nani-back', onNaniBack);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('nani-back', onNaniBack);
    window.removeEventListener('keydown', onKey);
  };
}
