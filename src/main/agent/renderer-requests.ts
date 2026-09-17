// Request/reply calls from main to the overlay renderer, for the bits of agent
// commands that need renderer state: saving debounced edits, and the timer
// (whose state and ticker live in the overlay). Messages sent before the
// overlay has registered its listeners would be lost, so everything waits for
// the overlay to report that it's ready.

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

// webContents id of the overlay page whose listeners are registered; reset
// when that page reloads or goes away.
let readyContentsId: number | null = null;
let readyWaiters: Array<() => void> = [];

function overlayReady(): boolean {
  const win = getOverlayWindow();
  return !!win && !win.isDestroyed() && win.webContents.id === readyContentsId;
}

export function whenOverlayReady(timeoutMs: number): Promise<void> {
  if (overlayReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      readyWaiters = readyWaiters.filter(w => w !== done);
      reject(new AgentError("The toolbox window isn't ready yet. Try again in a moment."));
    }, timeoutMs);
    readyWaiters.push(done);
  });
}

export function initRendererRequests(): void {
  ipcMain.on(IPC.AgentRendererReady, e => {
    const contents = e.sender;
    if (contents.id !== getOverlayWindow()?.webContents.id) return;
    readyContentsId = contents.id;
    const reset = () => { if (readyContentsId === contents.id) readyContentsId = null; };
    contents.once('did-start-loading', reset);
    contents.once('render-process-gone', reset);
    contents.once('destroyed', reset);
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach(w => w());
  });

  ipcMain.on(IPC.AgentRendererReply, (_e, reply: { id: number; result?: unknown; error?: string }) => {
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    clearTimeout(p.timer);
    if (reply.error !== undefined) p.reject(new AgentError(reply.error));
    else p.resolve(reply.result);
  });
}

export async function requestRenderer<T>(kind: RendererRequestKind, payload: unknown, timeoutMs: number): Promise<T> {
  await whenOverlayReady(timeoutMs);
  const win = getOverlayWindow()!;
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
