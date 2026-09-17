import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { AgentActivity, AgentServerStatus, DataChange, Settings, Sheet, TimerState } from '../shared/types';

const api = {
  // Toolbox
  toggleToolbox: () => ipcRenderer.invoke(IPC.ToolboxToggle) as Promise<boolean>,
  openToolbox: () => ipcRenderer.invoke(IPC.ToolboxOpen) as Promise<boolean>,
  closeToolbox: () => ipcRenderer.invoke(IPC.ToolboxClose) as Promise<boolean>,
  onToolboxState: (cb: (state: { open: boolean; dolphinCenter?: { x: number; y: number } }) => void) => {
    const listener = (_e: unknown, state: any) => cb(state);
    ipcRenderer.on(IPC.ToolboxState, listener);
    return () => ipcRenderer.removeListener(IPC.ToolboxState, listener);
  },

  // Dolphin drag (fire-and-forget)
  dolphinMoveStart: (offset: { x: number; y: number }) => ipcRenderer.send(IPC.DolphinMoveStart, offset),
  dolphinMove: () => ipcRenderer.send(IPC.DolphinMove),
  dolphinMoveEnd: () => ipcRenderer.send(IPC.DolphinMoveEnd),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.SettingsGet) as Promise<Settings>,
  setSettings: (partial: Partial<Settings>) => ipcRenderer.invoke(IPC.SettingsSet, partial) as Promise<Settings>,
  onSettingsChanged: (cb: (s: Settings) => void) => {
    const listener = (_e: unknown, s: Settings) => cb(s);
    ipcRenderer.on(IPC.SettingsChanged, listener);
    return () => ipcRenderer.removeListener(IPC.SettingsChanged, listener);
  },

  // Sheets
  listSheets: () => ipcRenderer.invoke(IPC.SheetList) as Promise<Array<Pick<Sheet, 'id' | 'title' | 'displayDate' | 'createdAt' | 'updatedAt'>>>,
  getSheet: (id: number | null) => ipcRenderer.invoke(IPC.SheetGet, id) as Promise<Sheet | null>,
  createSheet: (args: { title: string; displayDate: string | null }) => ipcRenderer.invoke(IPC.SheetCreate, args) as Promise<Sheet>,
  updateSheet: (sheet: Sheet) => ipcRenderer.invoke(IPC.SheetUpdate, sheet) as Promise<Sheet>,
  deleteSheet: (id: number) => ipcRenderer.invoke(IPC.SheetDelete, id) as Promise<boolean>,

  // Scratchpad files
  openMarkdown: () => ipcRenderer.invoke(IPC.ScratchpadOpen) as Promise<string | null>,
  saveMarkdown: (content: string) => ipcRenderer.invoke(IPC.ScratchpadSave, content) as Promise<boolean>,

  // Permanent scratchpad
  getPermanentScratchpad: () => ipcRenderer.invoke(IPC.PermanentScratchpadGet) as Promise<string>,
  setPermanentScratchpad: (content: string) => ipcRenderer.invoke(IPC.PermanentScratchpadSet, content) as Promise<boolean>,

  // Timer pill
  broadcastTimer: (state: TimerState | null) => ipcRenderer.send(IPC.TimerBroadcast, state),
  onTimerTick: (cb: (state: TimerState | null) => void) => {
    const listener = (_e: unknown, state: TimerState | null) => cb(state);
    ipcRenderer.on(IPC.TimerTick, listener);
    return () => ipcRenderer.removeListener(IPC.TimerTick, listener);
  },

  // Agent access
  runAgentTool: (tool: string, args: unknown) =>
    ipcRenderer.invoke(IPC.AgentRunTool, { tool, args }) as Promise<{ ok: true; result: unknown } | { ok: false; error: string }>,
  getAgentStatus: () => ipcRenderer.invoke(IPC.AgentStatus) as Promise<AgentServerStatus>,
  regenerateAgentToken: () => ipcRenderer.invoke(IPC.AgentRegenerateToken) as Promise<AgentServerStatus>,
  onAgentStatusChanged: (cb: (s: AgentServerStatus) => void) => {
    const listener = (_e: unknown, s: AgentServerStatus) => cb(s);
    ipcRenderer.on(IPC.AgentStatusChanged, listener);
    return () => ipcRenderer.removeListener(IPC.AgentStatusChanged, listener);
  },
  getAgentActivity: () => ipcRenderer.invoke(IPC.AgentActivityList) as Promise<AgentActivity[]>,
  onAgentActivity: (cb: (entry: AgentActivity) => void) => {
    const listener = (_e: unknown, entry: AgentActivity) => cb(entry);
    ipcRenderer.on(IPC.AgentActivity, listener);
    return () => ipcRenderer.removeListener(IPC.AgentActivity, listener);
  },
  // Main asks the overlay for renderer-side work (flush edits, drive the
  // timer); the handler's return value or thrown message is sent back.
  onAgentRendererRequest: (handler: (kind: 'flush' | 'timer', payload: any) => Promise<unknown> | unknown) => {
    const listener = async (_e: unknown, req: { id: number; kind: 'flush' | 'timer'; payload: unknown }) => {
      try {
        const result = await handler(req.kind, req.payload);
        ipcRenderer.send(IPC.AgentRendererReply, { id: req.id, result });
      } catch (err) {
        ipcRenderer.send(IPC.AgentRendererReply, { id: req.id, error: (err as Error)?.message ?? String(err) });
      }
    };
    ipcRenderer.on(IPC.AgentRendererRequest, listener);
    return () => ipcRenderer.removeListener(IPC.AgentRendererRequest, listener);
  },
  agentRendererReady: () => ipcRenderer.send(IPC.AgentRendererReady),
  onAgentShowSheet: (cb: (sheetId: number) => void) => {
    const listener = (_e: unknown, id: number) => cb(id);
    ipcRenderer.on(IPC.AgentShowSheet, listener);
    return () => ipcRenderer.removeListener(IPC.AgentShowSheet, listener);
  },
  onDataChanged: (cb: (change: DataChange) => void) => {
    const listener = (_e: unknown, change: DataChange) => cb(change);
    ipcRenderer.on(IPC.DataChanged, listener);
    return () => ipcRenderer.removeListener(IPC.DataChanged, listener);
  },
  copyText: (text: string) => ipcRenderer.invoke(IPC.ClipboardWrite, text) as Promise<boolean>,

  // App control
  quitApp: () => ipcRenderer.invoke(IPC.AppQuit) as Promise<boolean>,
  onOpenSettingsTab: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.OpenSettingsTab, listener);
    return () => ipcRenderer.removeListener(IPC.OpenSettingsTab, listener);
  },
  requestOpenTool: (tool: 'calculator' | 'timer' | 'calendar' | 'agent' | 'settings') => ipcRenderer.send(IPC.RequestOpenTool, tool),
  onOpenToolTab: (cb: (tool: 'calculator' | 'timer' | 'calendar' | 'agent' | 'settings') => void) => {
    const listener = (_e: unknown, tool: 'calculator' | 'timer' | 'calendar' | 'agent' | 'settings') => cb(tool);
    ipcRenderer.on(IPC.OpenToolTab, listener);
    return () => ipcRenderer.removeListener(IPC.OpenToolTab, listener);
  },
};

contextBridge.exposeInMainWorld('toolbox', api);

export type ToolboxAPI = typeof api;
