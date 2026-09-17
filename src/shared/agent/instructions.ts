// The instructions a user gives an AI assistant on another computer so it can
// write commands for the Agent Console. Generated from the catalog so they
// never drift from what the app accepts.

import { AGENT_TOOLS, FLAGS_HELP, STATUS_HELP, type JsonSchema } from './catalog';

function typeLabel(s: JsonSchema): string {
  if (s.enum) return s.enum.map(e => `"${e}"`).join(' | ');
  if (s.type === 'array') return s.items ? `list of ${s.items.type === 'object' ? 'objects' : typeLabel(s.items)}` : 'list';
  if (s.type === 'integer') {
    if (s.minimum !== undefined && s.maximum !== undefined) return `integer ${s.minimum}–${s.maximum}`;
    return 'integer';
  }
  return s.type ?? 'any';
}

function describeProps(schema: JsonSchema, indent: string): string[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([name, prop]) => {
    const head = `${indent}- \`${name}\` (${typeLabel(prop)}${required.has(name) ? ', required' : ''})`;
    const line = prop.description ? `${head}: ${prop.description}` : head;
    const nested = prop.type === 'array' && prop.items?.type === 'object' ? describeProps(prop.items, indent + '  ') : [];
    return [line, ...nested];
  });
}

export function buildRemoteInstructions(): string {
  const out: string[] = [
    "# Saphir's Toolbox: Agent Console commands",
    '',
    "Saphir's Toolbox is my daily planner app. It runs on another computer that you can't reach, so to change it, write commands " +
      "that I'll paste into its Agent Console. The console shows me what each command will do before I run it.",
    '',
    '## How to write commands',
    '',
    '- One command per line: the command name, a space, then its arguments as JSON on that same line. A command without arguments can stand alone.',
    '- Put all the commands in a single code block so I can copy them in one go.',
    '- Days are "YYYY-MM-DD", or "today", "tomorrow", "yesterday" (worked out on my computer when I run the commands). When a command takes a date, it defaults to today.',
    '- Commands run top to bottom and stop at the first one that fails.',
    "- Each day's to-do list has 18 rows. You can't see my list, so pick existing to-dos by their text with \"match\" rather than by row number.",
    '- Commands that read (get_day, list_days, search, get_scratchpad, get_timer) print their result in the console. If you need that information, ask me to run them and paste the output back to you.',
    '',
    'Example:',
    '',
    '```',
    'add_todos {"date":"tomorrow","items":[{"text":"Call the dentist"},{"text":"Send the invoice","flags":["important"]}]}',
    'update_todo {"date":"today","match":"quarterly report","status":"done"}',
    'write_day_notes {"date":"tomorrow","mode":"append","content":"## Standup\\n- Shipped v1.3"}',
    'control_timer {"action":"start","mode":"pomodoro"}',
    '```',
    '',
    '## To-do statuses and flags',
    '',
    STATUS_HELP,
    '',
    FLAGS_HELP,
    '',
    '## Commands',
  ];
  for (const tool of AGENT_TOOLS) {
    // The status and flag help is in its own section above; MCP clients get
    // it inside each tool's description instead.
    const description = tool.description.replace(STATUS_HELP, '').replace(FLAGS_HELP, '').trim();
    out.push('', `### ${tool.name}`, '', description);
    const props = describeProps(tool.inputSchema, '');
    out.push('', ...(props.length ? props : ['No arguments.']));
  }
  return out.join('\n') + '\n';
}
