// Time helpers that respect the household's timezone (default Asia/Kolkata),
// independent of the device clock's zone.

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(date)) p[x.type] = x.value;
  return {
    y: +p.year,
    mo: +p.month,
    d: +p.day,
    h: +p.hour % 24,
    mi: +p.minute,
    s: +p.second,
  };
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffset(date: Date, tz: string) {
  const p = parts(date, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** 'YYYY-MM-DD' for today in `tz`. */
export function todayIn(tz: string, now = new Date()) {
  const p = parts(now, tz);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** The instant when the wall-clock `time` ('HH:MM[:SS]') occurs on `date` ('YYYY-MM-DD') in `tz`. */
export function zonedToDate(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - tzOffset(new Date(guess), tz);
  // Re-check once in case the offset differs at the target instant (DST edges).
  return new Date(guess - tzOffset(new Date(first), tz));
}

export function startOfTodayIn(tz: string, now = new Date()) {
  return zonedToDate(todayIn(tz, now), '00:00', tz);
}

/** 'HH:MM' wall-clock time in `tz`, `minutesAhead` from now. */
export function hhmmIn(tz: string, minutesAhead = 0, now = new Date()) {
  const p = parts(new Date(now.getTime() + minutesAhead * 60000), tz);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

/** '09:00:00' → '9:00 am' */
export function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatClock(iso: string | Date, tz: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
}
