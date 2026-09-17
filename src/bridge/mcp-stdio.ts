// stdio MCP server for clients that launch local servers as a process
// (Claude Desktop, Cowork, Codex). It runs outside the app, as plain Node — the
// app's own executable with ELECTRON_RUN_AS_NODE=1 — and relays tool calls to
// the running app's local HTTP API, found through the discovery file the app
// writes while agent access is on.
//
//   "Saphir's Toolbox.exe" <this script> <path to agent-api.json>
//
// initialize and tools/list are answered here, so the client can connect even
// while the app is closed; tool calls then report that it isn't running.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { AgentError } from '../shared/agent/catalog';
import { handleMcpMessage } from '../shared/agent/mcp';

const discoveryFile = process.argv[2] || process.env.SAPHIRS_TOOLBOX_DISCOVERY || '';

function appVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const NOT_RUNNING =
  "Saphir's Toolbox isn't running, or agent access is turned off (Agent Console → Connect). Start it, then try again.";

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  let info: { url?: string; token?: string };
  try {
    info = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
  } catch {
    throw new AgentError(NOT_RUNNING);
  }
  let res: Response;
  try {
    res = await fetch(`${info.url}/api/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${info.token}`,
        'Content-Type': 'application/json',
        'X-Toolbox-Client': 'mcp-bridge',
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw new AgentError(NOT_RUNNING);
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; error?: string } | null;
  if (res.ok && body?.ok) return body.result;
  throw new AgentError(body?.error ?? `Saphir's Toolbox answered with HTTP ${res.status}.`);
}

const ctx = { version: appVersion(), callTool };

function send(message: object) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  if (!line.trim()) return;
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const messages = Array.isArray(msg) ? msg : [msg];
  for (const m of messages) {
    handleMcpMessage(m, ctx)
      .then(reply => { if (reply) send(reply); })
      .catch(err => process.stderr.write(`[saphirs-toolbox bridge] ${String(err)}\n`));
  }
});
rl.on('close', () => process.exit(0));

if (!discoveryFile) {
  process.stderr.write('[saphirs-toolbox bridge] No discovery file path given; tool calls will fail.\n');
}
