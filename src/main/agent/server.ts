// Local agent API: an HTTP server on 127.0.0.1 that AI agents on this computer
// use to drive the app.
//
//   POST /mcp          Model Context Protocol (Streamable HTTP, JSON responses)
//   GET  /api          the command catalog
//   POST /api/<tool>   run one command; body = its arguments as JSON
//   GET  /health       unauthenticated liveness check
//
// Every other request needs "Authorization: Bearer <token>". Browsers are
// turned away (Origin header / foreign Host), so web pages can't reach it even
// though it listens on localhost. While it runs, a discovery file in the user
// data folder tells local tools (and the stdio bridge) the URL and token.

import { app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { AGENT_TOOLS, AgentError } from '../../shared/agent/catalog';
import { handleMcpMessage, type McpContext } from '../../shared/agent/mcp';
import type { AgentServerStatus, Settings } from '../../shared/types';
import { runAgentTool } from './executor';

const MAX_BODY_BYTES = 5 * 1024 * 1024;

let server: http.Server | null = null;
let current: { enabled: boolean; port: number; token: string } | null = null;
let listening = false;
let lastError: string | null = null;
let statusListener: ((status: AgentServerStatus) => void) | null = null;
// Serializes (re)starts so a port is released before it's bound again.
let chain: Promise<void> = Promise.resolve();

export function generateAgentToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function discoveryFilePath(): string {
  return path.join(app.getPath('userData'), 'agent-api.json');
}

function bridgeScriptPath(): string {
  // dist-main/main/agent -> dist-main/bridge (inside app.asar when packaged)
  return path.join(__dirname, '..', '..', 'bridge', 'mcp-stdio.js');
}

export function onAgentStatusChanged(listener: (status: AgentServerStatus) => void): void {
  statusListener = listener;
}

export function getAgentServerStatus(): AgentServerStatus {
  const port = current?.port ?? 0;
  const url = `http://127.0.0.1:${port}`;
  return {
    enabled: !!current?.enabled,
    listening,
    port,
    error: lastError,
    url,
    mcpUrl: `${url}/mcp`,
    token: current?.token ?? '',
    discoveryFile: discoveryFilePath(),
    bridge: {
      command: process.execPath,
      args: [bridgeScriptPath(), discoveryFilePath()],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    },
    portable: !!process.env.PORTABLE_EXECUTABLE_FILE,
  };
}

function emitStatus() {
  statusListener?.(getAgentServerStatus());
}

// Starts, stops or restarts the server to match the settings.
export function configureAgentServer(settings: Settings): Promise<void> {
  const next = { enabled: settings.agentApiEnabled, port: settings.agentApiPort, token: settings.agentApiToken };
  chain = chain.then(async () => {
    const same = current && current.enabled === next.enabled && current.port === next.port && current.token === next.token;
    if (same && (listening || !next.enabled)) return;
    await stop();
    current = next;
    lastError = null;
    if (next.enabled) await start(next.port);
    emitStatus();
  });
  return chain;
}

// Synchronous part of stopping, for app quit: the process may exit before
// promises settle, and the discovery file must not outlive the app.
export function shutdownAgentServer(): void {
  removeDiscoveryFile();
  listening = false;
  server?.close();
  server?.closeAllConnections();
  server = null;
}

function stop(): Promise<void> {
  removeDiscoveryFile();
  listening = false;
  const s = server;
  server = null;
  if (!s) return Promise.resolve();
  return new Promise(resolve => {
    s.close(() => resolve());
    s.closeAllConnections();
  });
}

function start(port: number): Promise<void> {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      handle(req, res).catch(err => {
        console.error('[agent-server]', err);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal error' });
        else res.end();
      });
    });
    s.on('error', (err: NodeJS.ErrnoException) => {
      lastError = err.code === 'EADDRINUSE'
        ? `Port ${port} is already in use by another program. Pick a different port.`
        : `Couldn't start: ${err.message}`;
      listening = false;
      server = null;
      resolve();
    });
    s.listen(port, '127.0.0.1', () => {
      server = s;
      listening = true;
      writeDiscoveryFile(port);
      resolve();
    });
  });
}

function writeDiscoveryFile(port: number) {
  const url = `http://127.0.0.1:${port}`;
  const info = {
    app: 'saphirs-toolbox',
    version: app.getVersion(),
    pid: process.pid,
    url,
    mcpUrl: `${url}/mcp`,
    token: current?.token,
    help: `Send "Authorization: Bearer <token>". GET ${url}/api lists the commands; POST ${url}/api/<command> with a JSON body runs one. MCP clients: ${url}/mcp.`,
  };
  try {
    fs.writeFileSync(discoveryFilePath(), JSON.stringify(info, null, 2), 'utf8');
  } catch (err) {
    console.error('[agent-server] Failed to write discovery file:', err);
  }
}

function removeDiscoveryFile() {
  try {
    // Also clears a stale file left by a crash (the single-instance lock
    // means no other copy of the app can own it).
    const file = discoveryFilePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch { /* ignore */ }
}

// ── Request handling ─────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new AgentError('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorized(req: http.IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !current?.token) return false;
  const given = Buffer.from(match[1].trim());
  const expected = Buffer.from(current.token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const port = current?.port;
  const host = (req.headers.host ?? '').toLowerCase();
  // DNS-rebinding and browser protection.
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    return sendJson(res, 403, { ok: false, error: 'Forbidden host.' });
  }
  if (req.headers.origin) {
    return sendJson(res, 403, { ok: false, error: 'Requests from web pages are not allowed.' });
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && route === '/health') {
    return sendJson(res, 200, { ok: true, app: 'saphirs-toolbox', version: app.getVersion() });
  }
  if (!authorized(req)) {
    return sendJson(res, 401, {
      ok: false,
      error: "Missing or wrong token. Send \"Authorization: Bearer <token>\"; the token is in Saphir's Toolbox → Agent Console → Connect.",
    });
  }

  if (route === '/mcp') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      return res.end();
    }
    let payload: any;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const ctx: McpContext = { version: app.getVersion(), callTool: (name, args) => runAgentTool(name, args, 'mcp') };
    if (Array.isArray(payload)) {
      const replies = (await Promise.all(payload.map(m => handleMcpMessage(m, ctx)))).filter(Boolean);
      if (!replies.length) { res.writeHead(202); return res.end(); }
      return sendJson(res, 200, replies);
    }
    const reply = await handleMcpMessage(payload, ctx);
    if (!reply) { res.writeHead(202); return res.end(); }
    return sendJson(res, 200, reply);
  }

  if (route === '/api' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      app: 'saphirs-toolbox',
      version: app.getVersion(),
      usage: 'POST /api/<command> with the arguments as a JSON object. Responses are {"ok":true,"result":…} or {"ok":false,"error":"…"}.',
      commands: AGENT_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        arguments: t.inputSchema,
        readOnly: !!t.readOnly,
        destructive: !!t.destructive,
      })),
    });
  }

  const call = /^\/api\/([a-z_]+)$/.exec(route);
  if (call) {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      return res.end();
    }
    let args: unknown = {};
    try {
      const text = await readBody(req);
      if (text.trim()) args = JSON.parse(text);
    } catch {
      return sendJson(res, 400, { ok: false, error: 'The body must be a JSON object of arguments.' });
    }
    // The stdio bridge relays MCP calls through this route.
    const source = req.headers['x-toolbox-client'] === 'mcp-bridge' ? 'mcp' : 'http';
    try {
      const result = await runAgentTool(call[1], args, source);
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      const message = (err as Error).message;
      return sendJson(res, message.startsWith('Unknown command') ? 404 : 400, { ok: false, error: message });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'Not found. GET /api lists the commands.' });
}
