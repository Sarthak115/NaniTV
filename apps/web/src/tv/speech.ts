import { speak, ttsLanguages } from '../lib/native';
import type { Household, Message } from '../lib/types';

let cachedLangs: string[] | null = null;
function hasHindiVoice() {
  if (!cachedLangs || cachedLangs.length === 0) cachedLangs = ttsLanguages();
  return cachedLangs.some((l) => l.toLowerCase().startsWith('hi'));
}

/**
 * Speak a phrase in the elder's language. Without a Hindi voice (Fire TV Stick, see FL-3),
 * Hindi phrases are passed as Latin-script Hinglish and read by the English (India) voice.
 */
export function say(household: Household, hinglish: string, english: string) {
  if (household.language === 'hi') speak(hinglish, hasHindiVoice() ? 'hi' : 'en');
  else speak(english, 'en');
}

/** Read a message aloud: Devanagari with a Hindi voice, else the romanised tts_text. */
export function speakMessage(household: Household, m: Message, senderName: string) {
  const fallback = m.text ? `${senderName}: ${m.text}` : '';
  if (household.language === 'hi' && hasHindiVoice()) {
    speak(m.simplified_text ?? fallback, 'hi');
  } else {
    speak(m.tts_text ?? m.simplified_text ?? fallback, 'en');
  }
}
