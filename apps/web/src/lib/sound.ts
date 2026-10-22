// Soft chimes generated with WebAudio: no audio files, no copyright.

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.25) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Gentle two-note chime for new messages / someone joined. */
export function chimeMessage() {
  tone(880, 0, 0.6);
  tone(1318.5, 0.18, 0.9);
}

/** Distinct, slightly longer three-note chime for medicine reminders. */
export function chimeReminder() {
  tone(659.25, 0, 0.5, 0.3);
  tone(783.99, 0.3, 0.5, 0.3);
  tone(1046.5, 0.6, 1.1, 0.3);
}
