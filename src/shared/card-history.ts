// Pure helpers behind the to-do card history dropdown: which cards sit in the
// always-visible recent list, how older ones fold into a year → week tree,
// which "+ New card for …" shortcuts to offer, and what a deferred to-do
// becomes when it is copied to the next card. (Cards are called "sheets" in
// code and storage; "card" is the word the interface uses.)

import { EMPTY_TODO, TODOS_PER_SHEET, type TodoItem } from './types';
import { isoWeek, isoWeekYear, parseIsoDate, toIsoDate } from './date-format';

export interface CardSummary {
  id: number;
  title: string;
  displayDate: string | null;
  createdAt: string;
}

export interface WeekGroup<T> { key: string; week: number; cards: T[] }
export interface YearGroup<T> { key: string; year: number; weeks: WeekGroup<T>[] }

export interface CardHistory<T> {
  recent: T[];          // dated cards from last week's Monday on (future ones too)
  older: YearGroup<T>[]; // everything dated before that, newest first
  undated: T[];
}

// Keys of the collapsible groups, also used to remember which are open.
export const OLDER_KEY = 'older';
export const UNDATED_KEY = 'undated';
export const yearKey = (year: number) => `y${year}`;
export const weekKey = (year: number, week: number) => `w${year}-${week}`;

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

function newestFirst<T extends CardSummary>(a: T, b: T): number {
  const ka = a.displayDate ?? a.createdAt;
  const kb = b.displayDate ?? b.createdAt;
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function groupCards<T extends CardSummary>(cards: T[], today: Date): CardHistory<T> {
  const cutoff = toIsoDate(addDays(mondayOf(today), -7));
  const sorted = cards.slice().sort(newestFirst);
  const recent: T[] = [];
  const undated: T[] = [];
  const older: YearGroup<T>[] = [];
  for (const c of sorted) {
    if (!c.displayDate) { undated.push(c); continue; }
    if (c.displayDate >= cutoff) { recent.push(c); continue; }
    const d = parseIsoDate(c.displayDate);
    const year = isoWeekYear(d);
    const week = isoWeek(d);
    // Sorted newest first, so a new year/week is always appended at the end.
    let y = older[older.length - 1];
    if (!y || y.year !== year) { y = { key: yearKey(year), year, weeks: [] }; older.push(y); }
    let w = y.weeks[y.weeks.length - 1];
    if (!w || w.week !== week) { w = { key: weekKey(year, week), week, cards: [] }; y.weeks.push(w); }
    w.cards.push(c);
  }
  return { recent, older, undated };
}

// The group keys that must be open for this card to be visible.
export function groupKeysFor<T extends CardSummary>(history: CardHistory<T>, id: number): string[] {
  if (history.undated.some(c => c.id === id)) return [UNDATED_KEY];
  for (const y of history.older) {
    for (const w of y.weeks) {
      if (w.cards.some(c => c.id === id)) return [OLDER_KEY, y.key, w.key];
    }
  }
  return [];
}

export interface NewCardTarget {
  label: 'today' | 'tomorrow' | 'Monday';
  iso: string;
  copyDeferredFrom: string | null; // ISO date of the card whose deferred to-dos are copied
}

// "+ New card for today" until today has a card. After that, "+ New card for
// tomorrow", plus "+ New card for Monday" when tomorrow falls on a weekend;
// each one disappears once its day has a card. Both copy today's deferred
// to-dos.
export function newCardTargets(cards: CardSummary[], today: Date): NewCardTarget[] {
  const dated = new Set(cards.map(c => c.displayDate).filter(Boolean));
  const todayIso = toIsoDate(today);
  if (!dated.has(todayIso)) return [{ label: 'today', iso: todayIso, copyDeferredFrom: null }];
  const out: NewCardTarget[] = [];
  const tomorrow = addDays(today, 1);
  if (!dated.has(toIsoDate(tomorrow))) {
    out.push({ label: 'tomorrow', iso: toIsoDate(tomorrow), copyDeferredFrom: todayIso });
  }
  const tomorrowDow = tomorrow.getDay();
  if (tomorrowDow === 0 || tomorrowDow === 6) {
    const monday = addDays(tomorrow, tomorrowDow === 6 ? 2 : 1);
    if (!dated.has(toIsoDate(monday))) {
      out.push({ label: 'Monday', iso: toIsoDate(monday), copyDeferredFrom: todayIso });
    }
  }
  return out;
}

// The to-dos of a new card that carries over another card's deferred items:
// those items, in order, packed into the top rows. Each copy keeps its text
// and markers except deferred, progress (in progress, \, done) and the
// canceled corner. Blank rows fill the rest.
export function carryDeferred(todos: TodoItem[]): TodoItem[] {
  const carried: TodoItem[] = todos
    .filter(t => t.deferred && t.text.trim() !== '')
    .slice(0, TODOS_PER_SHEET)
    .map(t => ({ ...t, deferred: false, progress: 'empty' as const, canceled: false }));
  while (carried.length < TODOS_PER_SHEET) carried.push({ ...EMPTY_TODO });
  return carried;
}
