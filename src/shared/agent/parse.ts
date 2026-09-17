// Parses text pasted into the Agent Console into commands. The documented
// format is one command per line — the tool name, a space, then its arguments
// as JSON:
//
//   add_todos {"date":"2026-09-17","items":[{"text":"Call the dentist"}]}
//   control_timer {"action":"start","mode":"pomodoro"}
//
// It is forgiving about what AI chats tend to add: code fences, blank lines,
// # comments, a "$ " or "> " prompt, and JSON arguments pretty-printed over
// several lines. A JSON array of {"tool","args"} objects (or {"commands":[…]})
// is accepted too.

import { getTool, validateToolArgs, type ToolArgs } from './catalog';

export interface ParsedCommand {
  tool: string;
  args: ToolArgs;
  line: number;       // 1-based line where the command starts
  summary: string;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  commands: ParsedCommand[];
  errors: ParseError[];
}

const COMMAND_START = /^([a-z][a-z0-9_]*)(?:\s+([\[{].*)|\s*)$/;
const NOT_COMMANDS = new Set(['true', 'false', 'null']);

function finish(tool: string, rawArgs: unknown, line: number, out: ParseResult) {
  const def = getTool(tool);
  if (!def) {
    out.errors.push({ line, message: `Unknown command "${tool}".` });
    return;
  }
  const args = rawArgs === undefined ? {} : rawArgs;
  const err = validateToolArgs(def, args);
  if (err) {
    out.errors.push({ line, message: `${tool}: ${err}` });
    return;
  }
  let summary = tool;
  try { summary = def.summarize(args as ToolArgs); } catch { /* keep the name */ }
  out.commands.push({ tool, args: args as ToolArgs, line, summary });
}

function parseJsonForm(text: string, out: ParseResult) {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    out.errors.push({ line: 1, message: `Invalid JSON: ${(e as Error).message}` });
    return;
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as any).commands)
      ? (data as any).commands
      : [data];
  list.forEach((c: any, i: number) => {
    if (!c || typeof c !== 'object' || typeof c.tool !== 'string') {
      out.errors.push({ line: 1, message: `Command ${i + 1}: expected {"tool": "…", "args": {…}}.` });
      return;
    }
    finish(c.tool, c.args, 1, out);
  });
}

export function parseCommandText(input: string): ParseResult {
  const out: ParseResult = { commands: [], errors: [] };
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  // Drop code fences but keep line numbers stable.
  const cleaned = lines.map(l => (/^\s*(```|~~~)/.test(l) ? '' : l));

  const body = cleaned.join('\n').trim();
  if (!body) return out;
  if (body.startsWith('[') || body.startsWith('{')) {
    parseJsonForm(body, out);
    return out;
  }

  let current: { tool: string; line: number; json: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.json.join('\n').trim();
    if (!text) {
      finish(current.tool, undefined, current.line, out);
    } else {
      try {
        finish(current.tool, JSON.parse(text), current.line, out);
      } catch (e) {
        out.errors.push({ line: current.line, message: `${current.tool}: the arguments aren't valid JSON (${(e as Error).message}).` });
      }
    }
    current = null;
  };

  cleaned.forEach((raw, i) => {
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const stripped = trimmed.replace(/^(?:[$>]\s+|\/(?=[a-z]))/, '');
    const m = COMMAND_START.exec(stripped);
    if (m && !NOT_COMMANDS.has(m[1])) {
      flush();
      current = { tool: m[1], line: lineNo, json: m[2] ? [m[2]] : [] };
    } else if (current) {
      current.json.push(raw);
    } else {
      out.errors.push({ line: lineNo, message: `Expected a command name at the start of the line, like: get_day {"date":"today"}` });
    }
  });
  flush();
  return out;
}
