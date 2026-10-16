// Time zone math for the World Clock, built on the browser's IANA database
// (Intl), so every zone follows its real rules for any year: when (and whether)
// it observes daylight saving, and on which dates it switches.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

// Date.UTC with every year taken literally: Date.UTC itself reads 0–99 as
// 1900–1999, and the date field passes years like 0002 while "2026" is being
// typed.
export function utc(y: number, mo0: number, d: number, h = 0, mi = 0, s = 0): number {
  const date = new Date(Date.UTC(2000, mo0, d, h, mi, s));
  date.setUTCFullYear(y + date.getUTCFullYear() - 2000);
  return date.getTime();
}

export interface WallParts { y: number; mo: number; d: number; h: number; mi: number; s: number }

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

// The wall clock in a zone at a UTC instant.
export function wallParts(tz: string, ms: number): WallParts {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  const h = +o.hour === 24 ? 0 : +o.hour;
  return { y: +o.year, mo: +o.month, d: +o.day, h, mi: +o.minute, s: +o.second };
}

// Minutes the zone is ahead of UTC at that instant (negative west of Greenwich).
export function offsetMin(tz: string, ms: number): number {
  const p = wallParts(tz, ms);
  return Math.round((utc(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / MIN);
}

// A wall-clock time in a zone, as UTC. When clocks spring forward the time
// doesn't exist ('gap': read as the same moment an hour later on the new
// clock); when they fall back it happens twice ('ambiguous': both instants,
// earlier first).
export type WallResolution =
  | { kind: 'ok'; utc: number }
  | { kind: 'gap'; utc: number }
  | { kind: 'ambiguous'; options: [number, number] };

export function wallToUtc(tz: string, y: number, mo: number, d: number, h: number, mi: number): WallResolution {
  const wall = utc(y, mo - 1, d, h, mi);
  // The offsets in force a day either side cover any single transition.
  const before = offsetMin(tz, wall - DAY);
  const after = offsetMin(tz, wall + DAY);
  const matches: number[] = [];
  for (const o of new Set([before, after])) {
    const utc = wall - o * MIN;
    if (offsetMin(tz, utc) === o) matches.push(utc);
  }
  matches.sort((a, b) => a - b);
  if (matches.length === 0) return { kind: 'gap', utc: wall - before * MIN };
  if (matches.length > 1) return { kind: 'ambiguous', options: [matches[0], matches[1]] };
  return { kind: 'ok', utc: matches[0] };
}

export interface Transition { at: number; from: number; to: number } // offsets in minutes

const transitionCache = new Map<string, Transition[]>();

// Every offset change in a zone during a calendar year (UTC), found by
// stepping a day at a time and bisecting to the minute.
export function transitions(tz: string, year: number): Transition[] {
  const key = `${tz}|${year}`;
  const cached = transitionCache.get(key);
  if (cached) return cached;
  const out: Transition[] = [];
  let t = utc(year, 0, 1);
  const end = utc(year + 1, 0, 1);
  let prev = offsetMin(tz, t);
  while (t < end) {
    const next = t + DAY;
    const nextOff = offsetMin(tz, next);
    if (nextOff !== prev) {
      let lo = t, hi = next;
      while (hi - lo > MIN) {
        const mid = Math.floor((lo + hi) / 2 / MIN) * MIN;
        if (mid <= lo || mid >= hi) break;
        if (offsetMin(tz, mid) === prev) lo = mid; else hi = mid;
      }
      out.push({ at: hi, from: prev, to: nextOff });
    }
    prev = nextOff;
    t = next;
  }
  transitionCache.set(key, out);
  return out;
}

// Standard time is the smaller of the January and July offsets, which holds in
// both hemispheres (summer is July in the north, January in the south).
function standardOffset(tz: string, year: number): number {
  return Math.min(offsetMin(tz, utc(year, 0, 15)), offsetMin(tz, utc(year, 6, 15)));
}

export function isDst(tz: string, ms: number): boolean {
  return offsetMin(tz, ms) > standardOffset(tz, wallParts(tz, ms).y);
}

// Whether the zone changes its clocks at all in the year around this instant.
export function observesDst(tz: string, ms: number): boolean {
  const y = new Date(ms).getUTCFullYear();
  return transitions(tz, y).length > 0 || transitions(tz, y + 1).length > 0;
}

export function nextTransition(tz: string, ms: number): Transition | null {
  const y = new Date(ms).getUTCFullYear();
  for (const year of [y, y + 1]) {
    for (const t of transitions(tz, year)) if (t.at > ms) return t;
  }
  return null;
}

// Days since the epoch of the zone's local date, to compare calendar days.
export function dayIndex(tz: string, ms: number): number {
  const p = wallParts(tz, ms);
  return utc(p.y, p.mo - 1, p.d) / DAY;
}

// ── Formatting ───────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, ms: number, key: string, opts: Intl.DateTimeFormatOptions): string {
  const k = `${tz}|${key}`;
  let f = formatters.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }); }
    catch { f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }); }
    formatters.set(k, f);
  }
  return f.format(new Date(ms));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(tz: string, ms: number, hour12: boolean): { time: string; ampm: string } {
  const p = wallParts(tz, ms);
  return hour12
    ? { time: `${p.h % 12 || 12}:${pad(p.mi)}`, ampm: p.h < 12 ? 'AM' : 'PM' }
    : { time: `${pad(p.h)}:${pad(p.mi)}`, ampm: '' };
}

export function formatWall(h: number, mi: number, hour12: boolean): string {
  return hour12 ? `${h % 12 || 12}:${pad(mi)} ${h < 12 ? 'AM' : 'PM'}` : `${pad(h)}:${pad(mi)}`;
}

export const formatDate = (tz: string, ms: number) =>
  fmt(tz, ms, 'date', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const formatShortDate = (tz: string, ms: number) =>
  fmt(tz, ms, 'short', { month: 'short', day: 'numeric' });

// "UTC−7", "UTC+5:30", "UTC" — with a real minus sign.
export function formatOffset(min: number): string {
  if (min === 0) return 'UTC';
  const a = Math.abs(min);
  return `UTC${min < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
}

// A difference in minutes as "3 h", "5 h 30 min", "45 min".
export function formatHours(min: number): string {
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 h';
}

// The zone name Intl gives for a style, e.g. "PDT" (short), "Pacific Daylight
// Time" (long) or "Pacific Time" (longGeneric).
const nameFormatters = new Map<string, Intl.DateTimeFormat | null>();
function zoneName(tz: string, ms: number, style: 'short' | 'long' | 'longGeneric'): string {
  const k = `${tz}|${style}`;
  let f = nameFormatters.get(k);
  if (f === undefined) {
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }); }
    catch { f = null; }
    nameFormatters.set(k, f);
  }
  return f?.formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName')?.value ?? '';
}

// The zone's own abbreviation when Intl knows a lettered one ("PDT", "EST"),
// otherwise null — many zones only get "GMT+2", which the offset already says.
export function abbreviation(tz: string, ms: number): string | null {
  const name = zoneName(tz, ms, 'short');
  return /^[A-Z]{2,5}$/.test(name) && name !== 'UTC' && name !== 'GMT' ? name : null;
}

// "Central European Summer Time" — names the daylight-saving state itself.
export const longZoneName = (tz: string, ms: number) => zoneName(tz, ms, 'long');

// "Central European Time" — the name without the summer/standard part.
export const genericZoneName = (tz: string, ms: number) => zoneName(tz, ms, 'longGeneric') || zoneName(tz, ms, 'long');

// The wall-clock times either side of a transition: "2:00 AM → 3:00 AM".
export function transitionWall(t: Transition, hour12: boolean): [string, string] {
  const b = new Date(t.at + t.from * MIN), a = new Date(t.at + t.to * MIN);
  return [formatWall(b.getUTCHours(), b.getUTCMinutes(), hour12), formatWall(a.getUTCHours(), a.getUTCMinutes(), hour12)];
}

// ── The zone catalog ─────────────────────────────────────────────────────────

export interface ZoneInfo {
  id: string;        // IANA id, e.g. "America/Los_Angeles"
  city: string;      // "Los Angeles"
  country: string;   // "United States", or '' when unknown
  // Search fields, lowercase:
  names: string;     // zone names, e.g. "pacific time pacific standard time …"
  keys: string[];    // exact-match shorthands: Intl's abbreviations ("pst") and aliases ("usa")
  initials: string[]; // exact-match initials of the zone names ("cet"), a weaker match
  search: string;    // everything, including the id
}
// Chromium still reports a few zones under names their cities have since
// dropped; show the current spelling (the stored id stays the one Intl knows).
const CITY_RENAMES: Record<string, string> = {
  Calcutta: 'Kolkata', Kiev: 'Kyiv', Saigon: 'Ho Chi Minh City', Rangoon: 'Yangon',
  Katmandu: 'Kathmandu', Godthab: 'Nuuk', Ulan_Bator: 'Ulaanbaatar', Uzhgorod: 'Uzhhorod',
  Zaporozhye: 'Zaporizhzhia', Thimbu: 'Thimphu', Dacca: 'Dhaka', Macao: 'Macau',
  Ashkhabad: 'Ashgabat', Faeroe: 'Faroe Islands', Truk: 'Chuuk', Ponape: 'Pohnpei',
};

export function cityName(id: string): string {
  if (id === 'UTC' || id === 'Etc/UTC') return 'UTC';
  const last = id.split('/').pop() ?? id;
  return CITY_RENAMES[last] ?? last.replace(/_/g, ' ');
}

// Zone id → country name, built from the browser's own region data
// (Intl.Locale's time zones per region), so no table ships with the app.
let countryByZone: Map<string, string> | null = null;
function zoneCountries(): Map<string, string> {
  if (countryByZone) return countryByZone;
  countryByZone = new Map();
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    const A = 65;
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const code = String.fromCharCode(A + i, A + j);
        const name = names.of(code);
        if (!name) continue;
        const loc = new Intl.Locale(`und-${code}`) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
        const zones = loc.getTimeZones?.() ?? loc.timeZones ?? [];
        for (const z of zones) if (!countryByZone.has(z)) countryByZone.set(z, name);
      }
    }
  } catch { /* older engines: search falls back to cities and zone names */ }
  return countryByZone;
}

// Search terms that aren't in any name but people type anyway.
const ALIASES: Record<string, string[]> = {
  'United States': ['usa', 'us', 'america'],
  'United Kingdom': ['uk', 'britain', 'england', 'great britain', 'gb'],
  'United Arab Emirates': ['uae'],
  'South Korea': ['korea'],
  'Netherlands': ['holland'],
};

// Zones most people mean; they're listed first among equally good matches, so
// "usa" leads with New York and Chicago rather than Adak and Beulah.
const POPULAR = new Set([
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'America/Halifax',
  'America/St_Johns', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Buenos_Aires',
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Lima', 'America/Santiago',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Athens', 'Europe/Istanbul',
  'Europe/Kiev', 'Europe/Kyiv', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
  'Africa/Nairobi', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Calcutta', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei',
  'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Adelaide',
  'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'UTC',
]);

// Abbreviations people use that Intl doesn't spell out for most zones
// ("CET" comes out as "GMT+1"): the initials of the zone's long names, with
// and without "Standard". "Central European Standard Time" gives "cest" and
// "cet", "Central European Summer Time" gives "cest", "Japan Standard Time"
// gives "jst" and "jt". The odd extra form is harmless: these only count as an
// exact match for a whole word typed.
function initials(name: string): string[] {
  const words = name.split(/[\s-]+/).filter(w => /^[A-Za-z]/.test(w));
  if (words.length < 2) return [];
  const all = words.map(w => w[0]).join('');
  const noStd = words.filter(w => w !== 'Standard').map(w => w[0]).join('');
  return [...new Set([all, noStd])].map(x => x.toLowerCase());
}

let catalog: ZoneInfo[] | null = null;

export function zoneCatalog(): ZoneInfo[] {
  if (catalog) return catalog;
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const ids = supported ? supported('timeZone') : [];
  if (!ids.includes('UTC')) ids.push('UTC');
  const countries = zoneCountries();
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  const jan = utc(year, 0, 15), jul = utc(year, 6, 15);
  catalog = ids.map(id => {
    const city = cityName(id);
    const country = countries.get(id) ?? '';
    const longNames = [...new Set([genericZoneName(id, now), longZoneName(id, jan), longZoneName(id, jul)])].filter(Boolean);
    const keys = [
      ...(ALIASES[country] ?? []),
      ...[abbreviation(id, jan), abbreviation(id, jul)].filter((a): a is string => !!a).map(a => a.toLowerCase()),
    ];
    const names = longNames.join(' ').toLowerCase();
    const search = [city, country, id.replace(/[/_]/g, ' '), names].join(' ').toLowerCase();
    return { id, city, country, names, keys, initials: longNames.flatMap(initials), search };
  }).sort((a, b) => a.city.localeCompare(b.city));
  return catalog;
}

export function zoneInfo(id: string): ZoneInfo {
  return zoneCatalog().find(z => z.id === id)
    ?? { id, city: cityName(id), country: '', names: '', keys: [], initials: [], search: id.toLowerCase() };
}

// Best matches first: the city itself, then a shorthand ("pst", "uk"), the
// start of a city, the start of a country, a zone's initials ("cet"), the
// start of a zone name ("pacific"), the start of any word, and last anything
// containing it. Every word typed has to match somewhere.
export function searchZones(query: string, limit = 8): ZoneInfo[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const q = words.join(' ');
  const wordStart = new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const scored: Array<{ z: ZoneInfo; score: number }> = [];
  for (const z of zoneCatalog()) {
    if (!words.every(w => z.search.includes(w) || z.keys.includes(w) || z.initials.includes(w))) continue;
    const city = z.city.toLowerCase();
    const score = city === q ? 0
      : z.keys.includes(q) ? 1
      : city.startsWith(q) ? 2
      : z.country.toLowerCase().startsWith(q) ? 3
      : z.initials.includes(q) ? 4
      : wordStart.test(z.names) ? 5
      : wordStart.test(z.search) ? 6
      : 7;
    scored.push({ z, score });
  }
  const rank = (z: ZoneInfo) => (POPULAR.has(z.id) ? 0 : 1);
  return scored
    .sort((a, b) => a.score - b.score || rank(a.z) - rank(b.z) || a.z.city.localeCompare(b.z.city))
    .slice(0, limit)
    .map(s => s.z);
}

export function isValidZone(id: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: id }); return true; } catch { return false; }
}

export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
