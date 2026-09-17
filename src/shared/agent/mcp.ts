// Minimal Model Context Protocol server logic (tools only), transport-agnostic:
// the app's HTTP endpoint and the stdio bridge both feed JSON-RPC messages
// through handleMcpMessage and send back whatever it returns.

import { AGENT_TOOLS, AgentError, getTool } from './catalog';

// Newest first. We answer with the client's version when we know it,
// otherwise with our newest; tools-only servers are the same across these.
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  "Saphir's Toolbox is the user's daily planner: each day has a to-do list of 18 rows and Day Notes (Markdown), plus a permanent " +
  'Scratchpad and a timer. Days are addressed by date (YYYY-MM-DD, "today", "tomorrow", "yesterday"). Read a day with get_day before ' +
  'editing it when you need row numbers; to-dos can also be picked by their text with "match". Changes appear in the app immediately.';

export interface McpContext {
  version: string;
  // Runs a tool call, validating its arguments (so invalid calls are recorded
  // in the activity log too). Throw AgentError for problems the caller should
  // see; anything else is reported as an internal error.
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: any;
}

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: '2.0', id, result: value };
}

function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function mcpToolList() {
  return AGENT_TOOLS.map(t => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      title: t.title,
      readOnlyHint: !!t.readOnly,
      destructiveHint: !!t.destructive,
      openWorldHint: false,
    },
  }));
}

function toolResult(value: unknown, isError = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

// Returns the JSON-RPC response, or null for notifications and responses
// (which get none).
export async function handleMcpMessage(msg: JsonRpcMessage, ctx: McpContext): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return error(null, -32600, 'Invalid request');
  const isRequest = typeof msg.method === 'string' && msg.id !== undefined && msg.id !== null;
  if (!isRequest) {
    // Notifications (notifications/initialized, cancelled, …) and client
    // responses need no reply. Anything else malformed gets an error.
    if (typeof msg.method === 'string' || 'result' in msg || 'error' in msg) return null;
    return error(msg.id ?? null, -32600, 'Invalid request');
  }
  const id = msg.id as JsonRpcId;

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'saphirs-toolbox', title: "Saphir's Toolbox", version: ctx.version },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: mcpToolList() });
    case 'tools/call': {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      const tool = typeof name === 'string' ? getTool(name) : undefined;
      if (!tool) return error(id, -32602, `Unknown tool: ${String(name)}`);
      try {
        return result(id, toolResult(await ctx.callTool(tool.name, args)));
      } catch (e) {
        const message = e instanceof AgentError || (e as Error)?.name === 'AgentError'
          ? (e as Error).message
          : `Internal error: ${(e as Error)?.message ?? String(e)}`;
        return result(id, toolResult(message, true));
      }
    }
    default:
      return error(id, -32601, `Method not found: ${msg.method}`);
  }
}
