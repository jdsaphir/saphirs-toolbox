// Parse a free-form date string and produce a pretty display string with ISO week number.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ISO 8601 week number
export function isoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

// Local YYYY-MM-DD (avoids the UTC shift of Date.toISOString()).
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Parse a YYYY-MM-DD string into a local Date (midnight local time).
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// The title sheets use, matching the M/D/YYYY format the user types by hand.
export function formatSheetTitle(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// True when two dates fall on the same calendar day.
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Parse strings like "5/12/2026", "2026-05-12", "May 12 2026", "12 May 2026", etc.
// Returns ISO date YYYY-MM-DD or null.
export function parseDateInput(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso;
    return formatIso(+y, +m, +d);
  }

  // M/D/YYYY or M/D/YY (US-style — matches user's example 5/12/2026)
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (slash) {
    const [, m, d, yRaw] = slash;
    let y = +yRaw;
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return formatIso(y, +m, +d);
  }

  // Fallback: let Date parse it
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return formatIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return null;
}

function formatIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function prettyDate(isoOrNull: string | null): string {
  if (!isoOrNull) return '';
  const [y, m, d] = isoOrNull.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAYS[dt.getDay()];
  const month = MONTHS[dt.getMonth()];
  return `${wd}, ${month} ${ordinal(dt.getDate())}, ${y} (Week ${isoWeek(dt)})`;
}
