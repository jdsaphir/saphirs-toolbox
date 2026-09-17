// The commands AI agents can run against the app. This catalog is the single
// source of truth for every way in: MCP tools (local agents), the plain HTTP
// API, and the Agent Console where commands from a remote agent are pasted.
// Pure data + helpers, so main, the stdio bridge and the renderer can all
// import it.

import { parseIsoDate } from '../date-format';
import type { TodoItem } from '../types';

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  description?: string;
  enum?: readonly string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
}

export type ToolArgs = Record<string, any>;

export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly?: boolean;
  destructive?: boolean;
  // One-line, human-readable description of a call, for the console preview
  // and the activity log. Args are already validated against inputSchema.
  summarize: (args: ToolArgs) => string;
}

// Thrown for anything the caller should fix (bad arguments, missing data).
// The message is shown to the agent or the user as-is.
export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentError';
  }
}

// ── To-do vocabulary ─────────────────────────────────────────────────────────

export const TODO_STATUSES = ['todo', 'in_progress', 'done', 'backslash'] as const;
export type TodoStatus = typeof TODO_STATUSES[number];

// Flag names are the TodoItem keys themselves.
export const TODO_FLAGS = [
  'important', 'meeting', 'deferred', 'delegated', 'comment',
  'optional', 'personal', 'followUp', 'canceled',
  'chevronUp', 'chevronDown', 'circle',
] as const;
export type TodoFlag = typeof TODO_FLAGS[number] & keyof TodoItem;

export const STATUS_HELP =
  'Statuses: "todo" (empty box), "in_progress" (/), "done" (✓), "backslash" (reserved, no meaning yet).';
export const FLAGS_HELP =
  'Flags combine freely with the status and each other: "important" (text shown in gold), "meeting" (meeting or call), ' +
  '"deferred" (moved to a later day), "delegated" (handed to someone else), "comment" (a note line, not a task; text shown gray), ' +
  '"optional", "personal", "followUp", "canceled" (struck through). "chevronUp", "chevronDown" and "circle" are reserved.';

// ── Schema fragments ─────────────────────────────────────────────────────────

const DATE: JsonSchema = {
  type: 'string',
  description: 'The day: YYYY-MM-DD, or "today", "tomorrow", "yesterday" (as seen on the computer running the app). Defaults to today.',
};
const SHEET_ID: JsonSchema = {
  type: 'integer',
  minimum: 1,
  description: 'Instead of date: the sheetId of a list (from list_days). Only needed for lists that have no date.',
};
const ROW: JsonSchema = { type: 'integer', minimum: 1, maximum: 18, description: 'Row number, 1–18, as returned by get_day.' };
const MATCH: JsonSchema = {
  type: 'string',
  minLength: 1,
  description: 'Instead of row: text identifying the to-do (case-insensitive; an exact match wins, otherwise it must be part of exactly one to-do).',
};
const STATUS: JsonSchema = { type: 'string', enum: TODO_STATUSES, description: STATUS_HELP };
const FLAGS = (description: string): JsonSchema => ({ type: 'array', items: { type: 'string', enum: TODO_FLAGS }, description });
const ITEM: JsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'The to-do text (single line).' },
    status: { ...STATUS, description: 'Defaults to "todo".' },
    flags: FLAGS('Flags to set, e.g. ["important"].'),
  },
  required: ['text'],
  additionalProperties: false,
};
const NOTES_MODE: JsonSchema = {
  type: 'string',
  enum: ['append', 'prepend', 'replace'],
  description: '"append" adds after the existing text, "prepend" before it, "replace" overwrites everything.',
};

function object(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

// ── Summary helpers ──────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayName(args: ToolArgs, key = 'date'): string {
  if (key === 'date' && args.sheetId !== undefined) return `list #${args.sheetId}`;
  const raw = args[key];
  if (raw === undefined || raw === '') return 'today';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = parseIsoDate(s);
    if (!isNaN(d.getTime())) return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  return s;
}

function quote(s: unknown, max = 40): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return `“${t.length > max ? t.slice(0, max - 1) + '…' : t}”`;
}

function target(args: ToolArgs): string {
  return args.row !== undefined ? `row ${args.row}` : quote(args.match);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ── Tools ────────────────────────────────────────────────────────────────────

export const AGENT_TOOLS: AgentTool[] = [
  // Reading
  {
    name: 'get_day',
    title: 'Get a day',
    description:
      "Read one day's to-do list and Day Notes. Returns the used rows (row number, text, status, flags), how many rows are free " +
      'at the end (a list has 18 rows), and the notes (Markdown). If no list exists for that day yet, exists is false.',
    inputSchema: object({ date: DATE, sheetId: SHEET_ID }),
    readOnly: true,
    summarize: a => `Read ${dayName(a)}`,
  },
  {
    name: 'list_days',
    title: 'List days',
    description:
      'List the days that have a to-do list, newest first, with how many to-dos each has and how many are done. ' +
      'Optionally limit to a date range (inclusive).',
    inputSchema: object({
      from: { type: 'string', description: 'Earliest day (YYYY-MM-DD, "today", …).' },
      to: { type: 'string', description: 'Latest day (YYYY-MM-DD, "today", …).' },
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Maximum number of days to return. Defaults to 31.' },
    }),
    readOnly: true,
    summarize: a => (a.from || a.to) ? `List days ${a.from ? `from ${dayName(a, 'from')} ` : ''}${a.to ? `to ${dayName(a, 'to')}` : ''}`.trim() : 'List days',
  },
  {
    name: 'search',
    title: 'Search',
    description: 'Search every day for to-dos and Day Notes containing some text (case-insensitive). Newest days first.',
    inputSchema: object({
      query: { type: 'string', minLength: 1, description: 'Text to look for.' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum number of matches. Defaults to 50.' },
    }, ['query']),
    readOnly: true,
    summarize: a => `Search for ${quote(a.query)}`,
  },
  {
    name: 'get_scratchpad',
    title: 'Get the scratchpad',
    description: 'Read the permanent Scratchpad: Markdown notes that stay the same whichever day is displayed.',
    inputSchema: object({}),
    readOnly: true,
    summarize: () => 'Read the scratchpad',
  },
  {
    name: 'get_timer',
    title: 'Get the timer',
    description: 'Read the timer: mode (stopwatch, timer or pomodoro), whether it is running, and the time shown.',
    inputSchema: object({}),
    readOnly: true,
    summarize: () => 'Read the timer',
  },

  // To-dos
  {
    name: 'add_todos',
    title: 'Add to-dos',
    description:
      "Add one or more to-dos to a day's list, creating the list if the day has none. By default they go right after the last used row; " +
      'use "at" to insert at a row instead (the rows below move down). Fails without changing anything if there is not enough room (18 rows per day). ' +
      STATUS_HELP + ' ' + FLAGS_HELP,
    inputSchema: object({
      date: DATE,
      sheetId: SHEET_ID,
      items: { type: 'array', items: ITEM, minItems: 1, maxItems: 18, description: 'The to-dos to add, in order.' },
      at: { ...ROW, description: 'Optional row number (1–18) to insert at.' },
    }, ['items']),
    summarize: a => `Add ${plural(a.items.length, 'to-do')} to ${dayName(a)}: ${a.items.map((i: ToolArgs) => quote(i.text, 24)).join(', ')}`,
  },
  {
    name: 'update_todo',
    title: 'Update a to-do',
    description:
      'Change one to-do, picked by row or match: its text, status and/or flags. "flags" replaces all flags; "addFlags" and "removeFlags" ' +
      'change only the ones listed. Fields you leave out stay as they are. ' + STATUS_HELP + ' ' + FLAGS_HELP,
    inputSchema: object({
      date: DATE,
      sheetId: SHEET_ID,
      row: ROW,
      match: MATCH,
      text: { type: 'string', description: 'New text.' },
      status: STATUS,
      flags: FLAGS('Replace all flags with exactly these ([] clears them).'),
      addFlags: FLAGS('Flags to turn on.'),
      removeFlags: FLAGS('Flags to turn off.'),
    }),
    summarize: a => {
      const changes: string[] = [];
      if (a.text !== undefined) changes.push(`text → ${quote(a.text, 24)}`);
      if (a.status !== undefined) changes.push(`status → ${a.status}`);
      if (a.flags !== undefined) changes.push(`flags → [${a.flags.join(', ')}]`);
      if (a.addFlags?.length) changes.push(`+${a.addFlags.join(' +')}`);
      if (a.removeFlags?.length) changes.push(`−${a.removeFlags.join(' −')}`);
      return `Update ${target(a)} on ${dayName(a)}${changes.length ? `: ${changes.join(', ')}` : ''}`;
    },
  },
  {
    name: 'remove_todo',
    title: 'Remove a to-do',
    description: 'Remove one to-do, picked by row or match. The rows below move up.',
    inputSchema: object({ date: DATE, sheetId: SHEET_ID, row: ROW, match: MATCH }),
    destructive: true,
    summarize: a => `Remove ${target(a)} from ${dayName(a)}`,
  },
  {
    name: 'move_todo',
    title: 'Move a to-do',
    description: 'Move one to-do, picked by row or match, to another row. The rows in between shift to make room.',
    inputSchema: object({ date: DATE, sheetId: SHEET_ID, row: ROW, match: MATCH, to: { ...ROW, description: 'Destination row, 1–18.' } }, ['to']),
    summarize: a => `Move ${target(a)} to row ${a.to} on ${dayName(a)}`,
  },
  {
    name: 'set_todos',
    title: "Replace a day's to-dos",
    description:
      "Replace a day's whole to-do list with these items (rows 1, 2, 3, … in order; the remaining rows are cleared), creating the list if needed. " +
      'An empty array clears the list. Day Notes are not touched. ' + STATUS_HELP + ' ' + FLAGS_HELP,
    inputSchema: object({
      date: DATE,
      sheetId: SHEET_ID,
      items: { type: 'array', items: ITEM, maxItems: 18, description: 'The complete list, in order.' },
    }, ['items']),
    destructive: true,
    summarize: a => a.items.length
      ? `Replace ${dayName(a)}'s to-dos with ${plural(a.items.length, 'item')}`
      : `Clear ${dayName(a)}'s to-dos`,
  },
  {
    name: 'carry_over',
    title: 'Carry over unfinished to-dos',
    description:
      'Copy the unfinished to-dos of one day to another day (created if needed): every to-do that is not done, canceled, deferred or a comment. ' +
      'To-dos the destination already has (same text) are skipped. By default the originals are then flagged "deferred". ' +
      'Fails without changing anything if the destination does not have enough free rows.',
    inputSchema: object({
      from: { type: 'string', description: 'Day to copy from (YYYY-MM-DD, "yesterday", …).' },
      to: { type: 'string', description: 'Day to copy to. Defaults to today.' },
      markDeferred: { type: 'boolean', description: 'Flag the originals as deferred. Defaults to true.' },
    }, ['from']),
    summarize: a => `Carry unfinished to-dos from ${dayName(a, 'from')} to ${dayName(a, 'to')}`,
  },
  {
    name: 'delete_day',
    title: 'Delete a day',
    description: "Delete a day's list entirely: all its to-dos and its Day Notes. This can't be undone.",
    inputSchema: object({
      date: { ...DATE, description: 'The day: YYYY-MM-DD, or "today", "tomorrow", "yesterday". Required unless sheetId is given.' },
      sheetId: SHEET_ID,
    }),
    destructive: true,
    summarize: a => `Delete ${dayName(a)} (to-dos and notes)`,
  },

  // Notes
  {
    name: 'write_day_notes',
    title: 'Write Day Notes',
    description: "Write a day's Day Notes (Markdown), creating the day's list if needed.",
    inputSchema: object({ date: DATE, sheetId: SHEET_ID, content: { type: 'string', description: 'Markdown text.' }, mode: NOTES_MODE }, ['content', 'mode']),
    destructive: true,
    summarize: a => `${a.mode === 'replace' ? 'Replace' : a.mode === 'prepend' ? 'Prepend to' : 'Append to'} ${dayName(a)}'s notes: ${quote(a.content)}`,
  },
  {
    name: 'write_scratchpad',
    title: 'Write the scratchpad',
    description: 'Write the permanent Scratchpad (Markdown), which stays the same whichever day is displayed.',
    inputSchema: object({ content: { type: 'string', description: 'Markdown text.' }, mode: NOTES_MODE }, ['content', 'mode']),
    destructive: true,
    summarize: a => `${a.mode === 'replace' ? 'Replace' : a.mode === 'prepend' ? 'Prepend to' : 'Append to'} the scratchpad: ${quote(a.content)}`,
  },

  // Timer
  {
    name: 'control_timer',
    title: 'Control the timer',
    description:
      'Control the timer shown above the dolphin. Actions: "start" (start from the beginning; set mode and lengths here), "pause", ' +
      '"resume" (continue after a pause), "reset" (back to the beginning, stopped), "clear" (stop and hide it). ' +
      'Modes: "stopwatch" (counts up), "timer" (counts down from minutes), "pomodoro" (alternates work and break phases). ' +
      'Lengths you leave out keep their current values (defaults: timer 5, pomodoro 25 / 5).',
    inputSchema: object({
      action: { type: 'string', enum: ['start', 'pause', 'resume', 'reset', 'clear'] },
      mode: { type: 'string', enum: ['stopwatch', 'timer', 'pomodoro'], description: 'For start and reset. Defaults to the current mode.' },
      minutes: { type: 'integer', minimum: 1, maximum: 999, description: 'Timer length.' },
      workMinutes: { type: 'integer', minimum: 1, maximum: 999, description: 'Pomodoro work phase length.' },
      breakMinutes: { type: 'integer', minimum: 1, maximum: 999, description: 'Pomodoro break phase length.' },
    }, ['action']),
    summarize: a => {
      const verb = a.action[0].toUpperCase() + a.action.slice(1);
      let lengths = '';
      if (a.minutes) lengths = ` (${a.minutes} min)`;
      if (a.workMinutes || a.breakMinutes) lengths = ` (${a.workMinutes ?? '–'} / ${a.breakMinutes ?? '–'} min)`;
      return `${verb} the ${a.mode ?? 'timer'}${lengths}`;
    },
  },

  // Window
  {
    name: 'show_day',
    title: 'Show a day',
    description: "Open the toolbox on screen, displaying a day's list (created empty if it doesn't exist, like clicking the day in the calendar).",
    inputSchema: object({ date: DATE, sheetId: SHEET_ID }),
    summarize: a => `Show ${dayName(a)} on screen`,
  },
];

const BY_NAME = new Map(AGENT_TOOLS.map(t => [t.name, t]));

export function getTool(name: string): AgentTool | undefined {
  return BY_NAME.get(name);
}

// ── Argument validation ──────────────────────────────────────────────────────

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function describeType(t: string): string {
  return t === 'integer' ? 'a whole number' : t === 'array' ? 'a list' : t === 'object' ? 'an object' : `a ${t}`;
}

// Returns the first problem with `value`, or null when it fits the schema.
// Covers the subset of JSON Schema the catalog uses.
function check(schema: JsonSchema, value: unknown, path: string): string | null {
  const actual = typeOf(value);
  if (schema.type) {
    const ok = schema.type === actual || (schema.type === 'number' && actual === 'integer');
    if (!ok) return `${path} must be ${describeType(schema.type)}${schema.enum ? ` (${schema.enum.map(e => `"${e}"`).join(', ')})` : ''}.`;
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    return `${path} must be one of ${schema.enum.map(e => `"${e}"`).join(', ')} (got ${JSON.stringify(value)}).`;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path} must be at least ${schema.minimum}.`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path} must be at most ${schema.maximum}.`;
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
    return `${path} must not be empty.`;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path} needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}.`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path} can have at most ${schema.maxItems} items.`;
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const err = check(schema.items, value[i], `${path}[${i}]`);
        if (err) return err;
      }
    }
  }
  if (actual === 'object' && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined) return `${path === 'arguments' ? '' : `${path}: `}"${key}" is required.`;
    }
    for (const [key, v] of Object.entries(obj)) {
      const prop = schema.properties[key];
      if (!prop) {
        if (schema.additionalProperties === false) {
          const known = Object.keys(schema.properties);
          return `Unknown argument "${key}"${path === 'arguments' ? '' : ` in ${path}`}. ` +
            (known.length ? `Expected: ${known.join(', ')}.` : 'This command takes no arguments.');
        }
        continue;
      }
      if (v === undefined) continue;
      const err = check(prop, v, `"${key}"`);
      if (err) return err;
    }
  }
  return null;
}

// Validates a call's arguments against its tool, including the cross-field
// rules JSON Schema can't express. Returns an error message or null.
export function validateToolArgs(tool: AgentTool, args: unknown): string | null {
  if (typeOf(args) !== 'object') return 'Arguments must be a JSON object.';
  const err = check(tool.inputSchema, args, 'arguments');
  if (err) return err;
  const a = args as ToolArgs;
  const props = tool.inputSchema.properties ?? {};
  if ('row' in props && 'match' in props) {
    if (a.row === undefined && a.match === undefined) return 'Say which to-do: give "row" or "match".';
    if (a.row !== undefined && a.match !== undefined) return 'Give either "row" or "match", not both.';
    if (typeof a.match === 'string' && a.match.trim() === '') return '"match" must not be blank.';
  }
  if ('sheetId' in props && a.sheetId !== undefined && a.date !== undefined) return 'Give either "date" or "sheetId", not both.';
  if (tool.name === 'delete_day' && a.date === undefined && a.sheetId === undefined) return 'Say which day to delete: give "date" (or "sheetId").';
  if (tool.name === 'update_todo') {
    const changes = ['text', 'status', 'flags', 'addFlags', 'removeFlags'].filter(k => a[k] !== undefined);
    if (!changes.length) return 'Nothing to change: give text, status, flags, addFlags or removeFlags.';
    if (a.flags !== undefined && (a.addFlags !== undefined || a.removeFlags !== undefined)) {
      return 'Use either "flags" or "addFlags"/"removeFlags", not both.';
    }
  }
  return null;
}
