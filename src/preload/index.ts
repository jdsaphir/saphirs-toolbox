import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { Settings, Sheet, TimerState } from '../shared/types';

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

  // Timer pill
  broadcastTimer: (state: TimerState | null) => ipcRenderer.send(IPC.TimerBroadcast, state),
  onTimerTick: (cb: (state: TimerState | null) => void) => {
    const listener = (_e: unknown, state: TimerState | null) => cb(state);
    ipcRenderer.on(IPC.TimerTick, listener);
    return () => ipcRenderer.removeListener(IPC.TimerTick, listener);
  },
};

contextBridge.exposeInMainWorld('toolbox', api);

export type ToolboxAPI = typeof api;
