// Request/reply calls from main to the overlay renderer, for the bits of agent
// commands that need renderer state: saving debounced edits, and the timer
// (whose state and ticker live in the overlay).

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { AgentError } from '../../shared/agent/catalog';
import { getOverlayWindow } from '../windows';

export type RendererRequestKind = 'flush' | 'timer';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<number, Pending>();
let nextId = 1;

export function initRendererRequests(): void {
  ipcMain.on(IPC.AgentRendererReply, (_e, reply: { id: number; result?: unknown; error?: string }) => {
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    clearTimeout(p.timer);
    if (reply.error !== undefined) p.reject(new AgentError(reply.error));
    else p.resolve(reply.result);
  });
}

export function requestRenderer<T>(kind: RendererRequestKind, payload: unknown, timeoutMs: number): Promise<T> {
  const win = getOverlayWindow();
  if (!win || win.isDestroyed() || win.webContents.isLoading()) {
    return Promise.reject(new AgentError("The toolbox window isn't ready yet. Try again in a moment."));
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AgentError("The toolbox window didn't respond. Try again in a moment."));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    win.webContents.send(IPC.AgentRendererRequest, { id, kind, payload });
  });
}
