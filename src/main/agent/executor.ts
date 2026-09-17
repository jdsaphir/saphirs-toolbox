// Runs agent commands (see src/shared/agent/catalog.ts) against the database.
// Every entry point — MCP, HTTP, the Agent Console — ends up in runAgentTool,
// which validates, runs one command at a time, and records the activity.

import { AgentError, getTool, validateToolArgs, type TodoFlag, type TodoStatus, type ToolArgs, TODO_FLAGS } from '../../shared/agent/catalog';
import { formatSheetTitle, parseDateInput, parseIsoDate, prettyDate, toIsoDate } from '../../shared/date-format';
import { formatTimer } from '../../shared/timer-format';
import type { TimerAction } from '../../shared/timer-actions';
import { EMPTY_TODO, TODOS_PER_SHEET, type AgentActivity, type AgentSource, type DataChange, type Sheet, type TimerState, type TodoItem } from '../../shared/types';
import {
  createSheet,
  deleteSheet,
  findSheetByDate,
  getPermanentScratchpad,
  getSheet,
  listDaySummaries,
  searchSheets,
  setPermanentScratchpad,
  updateSheet,
} from '../db';

// What the executor needs from the rest of the app, wired up in index.ts.
export interface AgentHooks {
  // Save edits the overlay is still debouncing, so a command sees them.
  flushRenderer: () => Promise<void>;
  notifyChanged: (change: DataChange) => void;
  // The timer lives in the overlay renderer.
  timer: (action: TimerAction | null) => Promise<TimerState>;
  showSheet: (sheetId: number) => void;
  onActivity: (entry: AgentActivity) => void;
}

let hooks: AgentHooks | null = null;

export function initAgentExecutor(h: AgentHooks): void {
  hooks = h;
}

// ── Activity log ─────────────────────────────────────────────────────────────

const ACTIVITY_LIMIT = 100;
const activity: AgentActivity[] = [];
let nextActivityId = 1;

export function getAgentActivity(): AgentActivity[] {
  return activity.slice();
}

function record(source: AgentSource, tool: string, summary: string, error?: string) {
  const entry: AgentActivity = {
    id: nextActivityId++,
    at: new Date().toISOString(),
    source,
    tool,
    summary,
    ok: error === undefined,
    ...(error !== undefined ? { error } : {}),
  };
  activity.push(entry);
  if (activity.length > ACTIVITY_LIMIT) activity.shift();
  hooks?.onActivity(entry);
}

// ── Entry point ──────────────────────────────────────────────────────────────

let queue: Promise<unknown> = Promise.resolve();

// Commands run strictly one after another, so a batch pasted in the console
// and a local agent can't interleave half-finished edits.
export function runAgentTool(name: string, args: unknown, source: AgentSource): Promise<unknown> {
  const run = queue.then(() => execute(name, args ?? {}, source));
  queue = run.catch(() => undefined);
  return run;
}

async function execute(name: string, args: unknown, source: AgentSource): Promise<unknown> {
  if (!hooks) throw new AgentError("Saphir's Toolbox is still starting. Try again in a moment.");
  const tool = getTool(name);
  if (!tool) {
    const message = `Unknown command "${name}".`;
    record(source, name, name, message);
    throw new AgentError(message);
  }
  const invalid = validateToolArgs(tool, args);
  if (invalid) {
    record(source, name, name, invalid);
    throw new AgentError(invalid);
  }
  const a = args as ToolArgs;
  let summary = name;
  try { summary = tool.summarize(a); } catch { /* keep the name */ }

  try {
    // Reads too, so they include what the user typed a moment ago.
    await hooks.flushRenderer();
    const result = await HANDLERS[name](a, hooks);
    record(source, name, summary);
    return result;
  } catch (e) {
    const message = e instanceof AgentError ? e.message : `Unexpected error: ${(e as Error)?.message ?? String(e)}`;
    if (!(e instanceof AgentError)) console.error('[agent]', name, e);
    record(source, name, summary, message);
    throw new AgentError(message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function resolveDate(input: unknown, name = 'date'): string {
  if (input === undefined || input === null || String(input).trim() === '') return toIsoDate(new Date());
  const s = String(input).trim();
  const lower = s.toLowerCase();
  if (lower === 'today') return toIsoDate(new Date());
  if (lower === 'tomorrow') return toIsoDate(addDays(new Date(), 1));
  if (lower === 'yesterday') return toIsoDate(addDays(new Date(), -1));
  const iso = /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s) ? parseDateInput(s) : null;
  if (!iso) throw new AgentError(`"${name}" must be a date like 2026-09-17, or "today", "tomorrow", "yesterday" (got "${s}").`);
  return iso;
}

// The sheet a day-scoped command targets. With create, a missing day gets a
// new list titled the way the calendar titles them.
function targetSheet(a: ToolArgs, create: true): { sheet: Sheet; created: boolean };
function targetSheet(a: ToolArgs, create: false): { sheet: Sheet | null; created: false; iso: string | null };
function targetSheet(a: ToolArgs, create: boolean): { sheet: Sheet | null; created: boolean; iso?: string | null } {
  if (a.sheetId !== undefined) {
    const sheet = getSheet(a.sheetId);
    if (!sheet) throw new AgentError(`There is no list with sheetId ${a.sheetId}.`);
    return { sheet, created: false, iso: sheet.displayDate };
  }
  const iso = resolveDate(a.date);
  const found = findSheetByDate(iso);
  if (found || !create) return { sheet: found, created: false, iso };
  return { sheet: createSheet({ title: formatSheetTitle(parseIsoDate(iso)), displayDate: iso }), created: true };
}

// For commands that edit an existing list.
function existingSheet(a: ToolArgs): Sheet {
  const { sheet, iso } = targetSheet(a, false);
  if (!sheet) throw new AgentError(`There is no list for ${prettyDate(iso)}.`);
  return sheet;
}

function dayLabel(sheet: Sheet): string {
  return prettyDate(sheet.displayDate) || sheet.title.trim() || '(untitled list)';
}

const STATUS_TO_PROGRESS: Record<TodoStatus, TodoItem['progress']> = {
  todo: 'empty', in_progress: 'in_progress', done: 'done', backslash: 'backslash',
};
const PROGRESS_TO_STATUS: Record<TodoItem['progress'], TodoStatus> = {
  empty: 'todo', in_progress: 'in_progress', done: 'done', backslash: 'backslash',
};

function flagsOf(t: TodoItem): TodoFlag[] {
  return TODO_FLAGS.filter(f => t[f as TodoFlag]) as TodoFlag[];
}

function isBlank(t: TodoItem): boolean {
  return t.text.trim() === '' && t.progress === 'empty' && flagsOf(t).length === 0;
}

// Todo text is a single-line input in the app.
function cleanText(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

function itemFrom(input: ToolArgs): TodoItem {
  const item: TodoItem = { ...EMPTY_TODO, text: cleanText(input.text), progress: STATUS_TO_PROGRESS[(input.status ?? 'todo') as TodoStatus] };
  for (const f of (input.flags ?? []) as TodoFlag[]) (item as any)[f] = true;
  return item;
}

function lastUsedIndex(todos: TodoItem[]): number {
  for (let i = todos.length - 1; i >= 0; i--) if (!isBlank(todos[i])) return i;
  return -1;
}

function dayView(sheet: Sheet) {
  const todos = sheet.todos.flatMap((t, i) => {
    if (isBlank(t)) return [];
    const flags = flagsOf(t);
    return [{ row: i + 1, text: t.text, status: PROGRESS_TO_STATUS[t.progress], ...(flags.length ? { flags } : {}) }];
  });
  return {
    exists: true,
    sheetId: sheet.id,
    date: sheet.displayDate,
    label: dayLabel(sheet),
    todos,
    freeRowsAtEnd: TODOS_PER_SHEET - 1 - lastUsedIndex(sheet.todos),
    notes: sheet.scratchpad,
  };
}

// Picks one todo by row or text. Returns its 0-based index.
function findRow(sheet: Sheet, a: ToolArgs): number {
  if (a.row !== undefined) {
    const idx = a.row - 1;
    if (isBlank(sheet.todos[idx])) throw new AgentError(`Row ${a.row} on ${dayLabel(sheet)} is empty.`);
    return idx;
  }
  const needle = String(a.match).trim().toLowerCase();
  const used = sheet.todos.map((t, i) => ({ t, i })).filter(({ t }) => t.text.trim() !== '');
  const exact = used.filter(({ t }) => t.text.trim().toLowerCase() === needle);
  if (exact.length === 1) return exact[0].i;
  const partial = exact.length > 1 ? exact : used.filter(({ t }) => t.text.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0].i;
  if (!partial.length) throw new AgentError(`No to-do on ${dayLabel(sheet)} matches "${a.match}".`);
  const options = partial.map(({ t, i }) => `row ${i + 1} "${t.text}"`).join(', ');
  throw new AgentError(`"${a.match}" matches several to-dos on ${dayLabel(sheet)}: ${options}. Use "row" or a more specific match.`);
}

// Inserts items at `index`, pushing the rows below down into the free rows at
// the end. Throws (without touching the sheet) if they don't fit.
function insertItems(sheet: Sheet, items: TodoItem[], index: number): TodoItem[] {
  const last = lastUsedIndex(sheet.todos);
  // Inserting among the used rows (or right after them) can only use the free
  // rows at the end; further down, only the rows from `index` on.
  const room = index <= last + 1 ? TODOS_PER_SHEET - 1 - last : TODOS_PER_SHEET - index;
  if (items.length > room) {
    throw new AgentError(
      `Not enough room on ${dayLabel(sheet)}: ${items.length} to-do${items.length === 1 ? '' : 's'} to add, ` +
      `but only ${room} free row${room === 1 ? '' : 's'} (a list has ${TODOS_PER_SHEET}). ` +
      'Remove some to-dos first, or rewrite the list with set_todos.'
    );
  }
  const todos = sheet.todos.slice();
  todos.splice(index, 0, ...items);
  return todos.slice(0, TODOS_PER_SHEET);
}

function mergeText(existing: string, content: string, mode: 'append' | 'prepend' | 'replace'): string {
  if (mode === 'replace' || !existing) return content;
  if (mode === 'append') return existing.endsWith('\n') || !content ? existing + content : `${existing}\n${content}`;
  return content.endsWith('\n') || !content ? content + existing : `${content}\n${existing}`;
}

function save(h: AgentHooks, sheet: Sheet, created: boolean) {
  const saved = updateSheet(sheet);
  h.notifyChanged({ sheetIds: [saved.id], deletedSheetIds: [], scratchpad: false });
  return { ...dayView(saved), ...(created ? { created: true } : {}) };
}

function timerView(s: TimerState) {
  return {
    mode: s.mode,
    running: s.running,
    display: formatTimer(s.seconds),
    [s.mode === 'stopwatch' ? 'elapsedSeconds' : 'remainingSeconds']: s.seconds,
    ...(s.mode === 'timer' && s.timerMinutes ? { timerMinutes: s.timerMinutes } : {}),
    ...(s.mode === 'pomodoro'
      ? { phase: s.pomodoroPhase ?? 'work', workMinutes: s.pomodoroWorkMin ?? 25, breakMinutes: s.pomodoroBreakMin ?? 5 }
      : {}),
  };
}

// ── Handlers ─────────────────────────────────────────────────────────────────

type Handler = (a: ToolArgs, h: AgentHooks) => unknown | Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  get_day: a => {
    const { sheet, iso } = targetSheet(a, false);
    if (sheet) return dayView(sheet);
    return { exists: false, date: iso, label: prettyDate(iso), todos: [], freeRowsAtEnd: TODOS_PER_SHEET, notes: '' };
  },

  list_days: a => {
    const from = a.from !== undefined ? resolveDate(a.from, 'from') : undefined;
    const to = a.to !== undefined ? resolveDate(a.to, 'to') : undefined;
    const days = listDaySummaries({ from, to, limit: a.limit ?? 31 });
    return {
      days: days.map(d => ({
        sheetId: d.id,
        date: d.displayDate,
        label: prettyDate(d.displayDate) || d.title.trim() || '(untitled list)',
        todos: d.todoCount,
        done: d.doneCount,
        hasNotes: d.hasNotes,
      })),
    };
  },

  search: a => {
    const query = String(a.query).trim();
    if (!query) throw new AgentError('"query" must not be empty.');
    const hits = searchSheets(query, a.limit ?? 50);
    return {
      matches: hits.map(hit => {
        const base = { sheetId: hit.sheetId, date: hit.displayDate, label: prettyDate(hit.displayDate) || hit.title.trim() || '(untitled list)' };
        if (hit.position !== null) return { ...base, in: 'todo', row: hit.position + 1, text: hit.text };
        // For notes, return the lines that contain the query rather than the whole text.
        const lines = hit.text.split('\n').filter(l => l.toLowerCase().includes(query.toLowerCase()));
        return { ...base, in: 'notes', lines };
      }),
    };
  },

  get_scratchpad: () => ({ content: getPermanentScratchpad() }),

  get_timer: async (_a, h) => timerView(await h.timer(null)),

  add_todos: (a, h) => {
    const { sheet, created } = targetSheet(a, true);
    const items = (a.items as ToolArgs[]).map(itemFrom);
    const index = a.at !== undefined ? a.at - 1 : lastUsedIndex(sheet.todos) + 1;
    return save(h, { ...sheet, todos: insertItems(sheet, items, index) }, created);
  },

  update_todo: (a, h) => {
    const sheet = existingSheet(a);
    const idx = findRow(sheet, a);
    const item: TodoItem = { ...sheet.todos[idx] };
    if (a.text !== undefined) item.text = cleanText(a.text);
    if (a.status !== undefined) item.progress = STATUS_TO_PROGRESS[a.status as TodoStatus];
    if (a.flags !== undefined) for (const f of TODO_FLAGS) (item as any)[f] = (a.flags as string[]).includes(f);
    for (const f of (a.addFlags ?? []) as TodoFlag[]) (item as any)[f] = true;
    for (const f of (a.removeFlags ?? []) as TodoFlag[]) (item as any)[f] = false;
    const todos = sheet.todos.slice();
    todos[idx] = item;
    return save(h, { ...sheet, todos }, false);
  },

  remove_todo: (a, h) => {
    const sheet = existingSheet(a);
    const idx = findRow(sheet, a);
    const todos = sheet.todos.slice();
    todos.splice(idx, 1);
    todos.push({ ...EMPTY_TODO });
    return save(h, { ...sheet, todos }, false);
  },

  move_todo: (a, h) => {
    const sheet = existingSheet(a);
    const from = findRow(sheet, a);
    const todos = sheet.todos.slice();
    const [item] = todos.splice(from, 1);
    todos.splice(a.to - 1, 0, item);
    return save(h, { ...sheet, todos }, false);
  },

  set_todos: (a, h) => {
    const { sheet, created } = targetSheet(a, true);
    const items = (a.items as ToolArgs[]).map(itemFrom);
    const todos = Array.from({ length: TODOS_PER_SHEET }, (_, i) => items[i] ?? { ...EMPTY_TODO });
    return save(h, { ...sheet, todos }, created);
  },

  carry_over: (a, h) => {
    const fromIso = resolveDate(a.from, 'from');
    const toIso = resolveDate(a.to, 'to');
    if (fromIso === toIso) throw new AgentError('"from" and "to" are the same day.');
    const source = findSheetByDate(fromIso);
    if (!source) throw new AgentError(`There is no list for ${prettyDate(fromIso)}.`);

    const unfinished = source.todos
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.text.trim() !== '' && t.progress !== 'done' && !t.canceled && !t.deferred && !t.comment);
    const existing = findSheetByDate(toIso);
    const already = new Set((existing?.todos ?? []).map(t => t.text.trim().toLowerCase()).filter(Boolean));
    const toCopy = unfinished.filter(({ t }) => !already.has(t.text.trim().toLowerCase()));
    const skipped = unfinished.filter(({ t }) => already.has(t.text.trim().toLowerCase())).map(({ t }) => t.text);

    if (!toCopy.length) {
      return {
        copied: [],
        skipped,
        message: unfinished.length ? `${prettyDate(toIso)} already has every unfinished to-do.` : `${prettyDate(fromIso)} has no unfinished to-dos.`,
      };
    }

    // Check room before creating or changing anything.
    const copies = toCopy.map(({ t }) => ({ ...t, deferred: false }));
    if (existing) insertItems(existing, copies, lastUsedIndex(existing.todos) + 1);
    const { sheet: dest, created } = targetSheet({ date: toIso }, true);
    const saved = save(h, { ...dest, todos: insertItems(dest, copies, lastUsedIndex(dest.todos) + 1) }, created);

    const markDeferred = a.markDeferred ?? true;
    if (markDeferred) {
      const todos = source.todos.slice();
      for (const { i } of toCopy) todos[i] = { ...todos[i], deferred: true };
      updateSheet({ ...source, todos });
      h.notifyChanged({ sheetIds: [source.id], deletedSheetIds: [], scratchpad: false });
    }
    return { copied: toCopy.map(({ t }) => t.text), skipped, markedDeferred: markDeferred, to: saved };
  },

  delete_day: (a, h) => {
    const sheet = existingSheet(a);
    deleteSheet(sheet.id);
    h.notifyChanged({ sheetIds: [], deletedSheetIds: [sheet.id], scratchpad: false });
    return { deleted: true, sheetId: sheet.id, label: dayLabel(sheet) };
  },

  write_day_notes: (a, h) => {
    const { sheet, created } = targetSheet(a, true);
    return save(h, { ...sheet, scratchpad: mergeText(sheet.scratchpad, a.content, a.mode) }, created);
  },

  write_scratchpad: (a, h) => {
    const content = mergeText(getPermanentScratchpad(), a.content, a.mode);
    setPermanentScratchpad(content);
    h.notifyChanged({ sheetIds: [], deletedSheetIds: [], scratchpad: true });
    return { content };
  },

  control_timer: async (a, h) => timerView(await h.timer({
    action: a.action,
    mode: a.mode,
    minutes: a.minutes,
    workMinutes: a.workMinutes,
    breakMinutes: a.breakMinutes,
  })),

  show_day: (a, h) => {
    const { sheet, created } = targetSheet(a, true);
    if (created) h.notifyChanged({ sheetIds: [sheet.id], deletedSheetIds: [], scratchpad: false });
    h.showSheet(sheet.id);
    return { shown: true, sheetId: sheet.id, label: dayLabel(sheet), ...(created ? { created: true } : {}) };
  },
};
