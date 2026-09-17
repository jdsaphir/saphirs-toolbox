import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../shared/api';
import { getTool } from '../../../shared/agent/catalog';
import { buildRemoteInstructions } from '../../../shared/agent/instructions';
import { parseCommandText, type ParsedCommand } from '../../../shared/agent/parse';
import type { AgentActivity, AgentServerStatus, Settings } from '../../../shared/types';

// The Agent Console: run commands written by an AI assistant that can't reach
// this computer (pasted in), see what agents have done, and connect agents that
// run on this computer.

interface Props {
  settings: Settings;
  onClose: () => void;
}

type Tab = 'run' | 'activity' | 'connect';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'run', label: 'Run' },
  { id: 'activity', label: 'Activity' },
  { id: 'connect', label: 'Connect' },
];

const TAB_KEY = 'agent-console-tab';

export const AgentConsole: React.FC<Props> = ({ settings, onClose }) => {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(TAB_KEY);
    return saved === 'activity' || saved === 'connect' ? saved : 'run';
  });

  function selectTab(t: Tab) {
    setTab(t);
    localStorage.setItem(TAB_KEY, t);
  }

  return (
    <div className="widget agent-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header" data-drag-handle>
        <span className="title">Agent Console</span>
        <div className="actions"><button className="ghost icon" onClick={onClose} title="Close">×</button></div>
      </div>
      <div className="agent-tabs">
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => selectTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="agent-body">
        {tab === 'run' && <RunTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'connect' && <ConnectTab settings={settings} />}
      </div>
    </div>
  );
};

// ── Copy button ──────────────────────────────────────────────────────────────

const CopyButton: React.FC<{ text: string | (() => string); label?: string; className?: string; title?: string }> = ({
  text, label = 'Copy', className = '', title,
}) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return (
    <button
      className={`agent-copy ${className}`}
      title={title}
      onClick={() => {
        api.copyText(typeof text === 'function' ? text() : text);
        setCopied(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
};

// ── Run ──────────────────────────────────────────────────────────────────────

type RunState =
  | { state: 'pending' | 'skipped' }
  | { state: 'ok'; result: unknown }
  | { state: 'error'; error: string };

type RunEntry = { cmd: ParsedCommand } & RunState;

const PLACEHOLDER = 'Paste commands from an AI assistant, e.g.\n\nget_day {"date":"today"}\nadd_todos {"items":[{"text":"Call the dentist"}]}';

function commandLine(cmd: ParsedCommand): string {
  return `${cmd.tool}${Object.keys(cmd.args).length ? ` ${JSON.stringify(cmd.args)}` : ''}`;
}

// What the user pastes back to the assistant.
function resultsText(entries: RunEntry[]): string {
  return entries.map(e => {
    const head = `> ${commandLine(e.cmd)}`;
    if (e.state === 'ok') return `${head}\n${JSON.stringify(e.result, null, 2)}`;
    if (e.state === 'error') return `${head}\nError: ${e.error}`;
    return `${head}\nNot run (an earlier command failed).`;
  }).join('\n\n') + '\n';
}

// The console keeps its text across tab switches and reopening.
let draftText = '';

const RunTab: React.FC = () => {
  const [text, setText] = useState(draftText);
  const [entries, setEntries] = useState<RunEntry[] | null>(null);
  const [running, setRunning] = useState(false);
  const parsed = useMemo(() => parseCommandText(text), [text]);
  const canRun = !running && parsed.commands.length > 0 && parsed.errors.length === 0;

  function changeText(v: string) {
    draftText = v;
    setText(v);
    setEntries(null);
  }

  async function run() {
    if (!canRun) return;
    setRunning(true);
    const out: RunEntry[] = parsed.commands.map(cmd => ({ cmd, state: 'pending' }));
    setEntries([...out]);
    for (let i = 0; i < out.length; i++) {
      const res = await api.runAgentTool(out[i].cmd.tool, out[i].cmd.args);
      out[i] = res.ok ? { cmd: out[i].cmd, state: 'ok', result: res.result } : { cmd: out[i].cmd, state: 'error', error: res.error };
      if (!res.ok) {
        for (let j = i + 1; j < out.length; j++) out[j] = { cmd: out[j].cmd, state: 'skipped' };
      }
      setEntries([...out]);
      if (!res.ok) break;
    }
    setRunning(false);
  }

  const failed = entries?.some(e => e.state === 'error');

  return (
    <div className="agent-run">
      <div className="agent-intro">
        <span>For an AI assistant on another computer: give it the instructions, then paste the commands it writes here.</span>
        <CopyButton text={buildRemoteInstructions} label="Copy AI instructions" title="Copy the command reference to paste into your AI chat" />
      </div>
      <textarea
        className="agent-input"
        value={text}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        onChange={e => changeText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
        }}
      />
      <div className="agent-actions">
        <button className="primary" disabled={!canRun} onClick={run} title="Ctrl+Enter">
          {running ? 'Running…' : parsed.commands.length > 1 ? `Run ${parsed.commands.length} commands` : 'Run'}
        </button>
        <button onClick={() => changeText('')} disabled={running || !text}>Clear</button>
        <span className="spacer" />
        {entries && !running && (
          <CopyButton text={() => resultsText(entries)} label="Copy results" title={failed ? 'Copy the results, including the error, for your AI chat' : 'Copy the results for your AI chat'} />
        )}
      </div>

      {!entries && text.trim() !== '' && (
        <div className="agent-preview">
          {parsed.errors.map((err, i) => (
            <div key={`e${i}`} className="agent-line error">
              <span className="mark">✗</span>
              <span className="what">Line {err.line}: {err.message}</span>
            </div>
          ))}
          {parsed.commands.map((cmd, i) => (
            <div key={i} className={`agent-line ${getTool(cmd.tool)?.destructive ? 'destructive' : ''}`}>
              <span className="mark">{i + 1}.</span>
              <span className="what">{cmd.summary}</span>
            </div>
          ))}
        </div>
      )}

      {entries && (
        <div className="agent-preview">
          {entries.map((e, i) => (
            <div key={i} className={`agent-line ${e.state}`}>
              <span className="mark">{e.state === 'ok' ? '✓' : e.state === 'error' ? '✗' : e.state === 'pending' ? '…' : '–'}</span>
              <div className="what">
                {e.cmd.summary}
                {e.state === 'error' && <div className="agent-error">{e.error}</div>}
                {e.state === 'ok' && getTool(e.cmd.tool)?.readOnly && (
                  <pre className="agent-code agent-result">{JSON.stringify(e.result, null, 2)}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

// ── Activity ─────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<AgentActivity['source'], string> = {
  console: 'Console',
  mcp: 'MCP',
  http: 'HTTP',
};

function timeOf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const ActivityTab: React.FC = () => {
  const [items, setItems] = useState<AgentActivity[]>([]);

  useEffect(() => {
    api.getAgentActivity().then(setItems);
    const off = api.onAgentActivity(entry => setItems(list => [...list.filter(e => e.id !== entry.id), entry].slice(-100)));
    return () => { off(); };
  }, []);

  if (!items.length) {
    return <div className="agent-empty">Nothing yet. Commands from AI agents and from this console show up here while the app is running.</div>;
  }
  return (
    <div className="agent-activity">
      {items.slice().reverse().map(item => (
        <div key={item.id} className={`agent-line ${item.ok ? 'ok' : 'error'}`}>
          <span className="mark">{item.ok ? '✓' : '✗'}</span>
          <div className="what">
            <div className="agent-activity-head">
              <span className={`agent-badge ${item.source}`}>{SOURCE_LABEL[item.source]}</span>
              <span className="agent-time">{timeOf(item.at)}</span>
            </div>
            {item.summary}
            {item.error && <div className="agent-error">{item.error}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Connect ──────────────────────────────────────────────────────────────────

const ConnectTab: React.FC<{ settings: Settings }> = ({ settings }) => {
  const [status, setStatus] = useState<AgentServerStatus | null>(null);
  const [portInput, setPortInput] = useState(String(settings.agentApiPort));
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    api.getAgentStatus().then(setStatus);
    const off = api.onAgentStatusChanged(setStatus);
    return () => { off(); };
  }, []);
  useEffect(() => setPortInput(String(settings.agentApiPort)), [settings.agentApiPort]);

  function applyPort() {
    const port = Math.floor(Number(portInput));
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      setPortInput(String(settings.agentApiPort));
      return;
    }
    if (port !== settings.agentApiPort) api.setSettings({ agentApiPort: port });
  }

  if (!status) return null;

  const serverName = 'saphirs-toolbox';
  const desktopConfig = JSON.stringify({
    mcpServers: { [serverName]: { command: status.bridge.command, args: status.bridge.args, env: status.bridge.env } },
  }, null, 2);
  const tomlString = (s: string) => JSON.stringify(s); // TOML basic strings escape like JSON
  const codexConfig = [
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(status.bridge.command)}`,
    `args = [${status.bridge.args.map(tomlString).join(', ')}]`,
    `env = { ${Object.entries(status.bridge.env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(', ')} }`,
  ].join('\n');
  const claudeCodeCommand =
    `claude mcp add --scope user --transport http ${serverName} ${status.mcpUrl} --header "Authorization: Bearer ${status.token}"`;
  const curlExample =
    `curl -X POST ${status.url}/api/get_day -H "Authorization: Bearer ${status.token}" -H "Content-Type: application/json" -d '{"date":"today"}'`;

  const statusText = !settings.agentApiEnabled
    ? 'Off: agents on this computer can’t reach the app.'
    : status.listening
      ? `Listening on 127.0.0.1:${status.port} (this computer only)`
      : status.error ?? 'Starting…';

  return (
    <div className="agent-connect">
      <div className={`agent-status ${!settings.agentApiEnabled ? 'off' : status.listening ? 'on' : 'problem'}`}>
        <span className="dot" />
        <span>{statusText}</span>
      </div>

      <div className="agent-row">
        <label className="agent-check">
          <input
            type="checkbox"
            checked={settings.agentApiEnabled}
            onChange={e => api.setSettings({ agentApiEnabled: e.target.checked })}
          />
          Allow AI agents on this computer
        </label>
        <span className="spacer" />
        <span className="agent-sub">Port</span>
        <input
          type="number"
          className="agent-port"
          min={1024}
          max={65535}
          value={portInput}
          onChange={e => setPortInput(e.target.value)}
          onBlur={applyPort}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      <p className="agent-note">
        Add the app to your agent once; it then sees tools like get_day, add_todos, update_todo, write_day_notes and control_timer.
        The app must be running when the agent uses them.
      </p>

      {status.portable && (
        <p className="agent-note warn">
          This is the portable build, which runs from a temporary folder that changes each launch, so the Claude Desktop and Codex
          setups below stop working after a restart. Use the installer build, or the Claude Code / HTTP setup, which don’t depend on it.
        </p>
      )}

      <Snippet
        title="Claude Desktop & Cowork"
        help="Claude → Settings → Developer → Edit Config. Merge this into claude_desktop_config.json, then restart Claude."
        code={desktopConfig}
      />
      <Snippet
        title="Claude Code"
        help="Run once in a terminal:"
        code={claudeCodeCommand}
      />
      <Snippet
        title="Codex"
        help="Add to ~/.codex/config.toml, then restart Codex:"
        code={codexConfig}
      />

      <div className="agent-section">
        <div className="agent-section-head">
          <span className="agent-section-title">Other tools (HTTP)</span>
        </div>
        <div className="agent-kv">
          <span className="agent-sub">MCP URL</span>
          <code>{status.mcpUrl}</code>
          <CopyButton text={status.mcpUrl} />
        </div>
        <div className="agent-kv">
          <span className="agent-sub">Token</span>
          <code className="agent-token" onClick={() => setShowToken(s => !s)} title={showToken ? 'Hide' : 'Show'}>
            {showToken ? status.token : '•'.repeat(16)}
          </code>
          <CopyButton text={status.token} />
        </div>
        <p className="agent-note">
          Send it as <code>Authorization: Bearer &lt;token&gt;</code>. <code>GET {status.url}/api</code> lists the commands. While the app runs, the URL
          and token are also in <code>{status.discoveryFile}</code>.
        </p>
        <Snippet title="Example" code={curlExample} compact />
        <div className="agent-actions">
          <button
            onClick={() => {
              if (confirm('Make a new token? Agents set up with the current token (e.g. Claude Code) will need the new one.')) {
                api.regenerateAgentToken().then(setStatus);
              }
            }}
          >
            New token
          </button>
        </div>
      </div>
    </div>
  );
};

const Snippet: React.FC<{ title: string; help?: string; code: string; compact?: boolean }> = ({ title, help, code, compact }) => (
  <div className={`agent-section ${compact ? 'compact' : ''}`}>
    <div className="agent-section-head">
      <span className={compact ? 'agent-sub' : 'agent-section-title'}>{title}</span>
      <CopyButton text={code} />
    </div>
    {help && <p className="agent-note">{help}</p>}
    <pre className="agent-code">{code}</pre>
  </div>
);
