import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC } from '../shared/ipc';
import {
  createSheet,
  deleteSheet,
  getOrCreateLatestSheet,
  getSettings,
  getSheet,
  initDb,
  listSheets,
  setSettings,
  updateSheet,
} from './db';
import {
  createDolphinWindow,
  createOverlayWindow,
  dolphinMove,
  dolphinMoveEnd,
  dolphinMoveStart,
  getDolphinScreenCenter,
  getDolphinWindow,
  getOverlayWindow,
  hideOverlay,
  isOverlayVisible,
  showOverlay,
} from './windows';
import { Settings, Sheet } from '../shared/types';

let registeredShortcut: string | null = null;

function registerShortcut(accelerator: string) {
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  try {
    const ok = globalShortcut.register(accelerator, () => toggleOverlay());
    if (ok) registeredShortcut = accelerator;
    else console.error('Failed to register shortcut:', accelerator);
  } catch (err) {
    console.error('Shortcut registration error:', err);
  }
}

function toggleOverlay() {
  if (isOverlayVisible()) closeOverlayAndNotify();
  else openOverlay();
}

function openOverlay() {
  const dolphinCenter = getDolphinScreenCenter();
  showOverlay();
  // Tell renderers (dolphin + overlay) where the dolphin is and that it's open
  broadcast(IPC.ToolboxState, { open: true, dolphinCenter });
}

function closeOverlayAndNotify() {
  hideOverlay();
  broadcast(IPC.ToolboxState, { open: false });
}

function broadcast<T>(channel: string, payload: T) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

app.whenReady().then(() => {
  initDb();
  const settings = getSettings();

  createDolphinWindow();
  createOverlayWindow();
  registerShortcut(settings.shortcut);

  // ── Toolbox ────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.ToolboxToggle, () => {
    toggleOverlay();
    return isOverlayVisible();
  });
  ipcMain.handle(IPC.ToolboxOpen, () => {
    openOverlay();
    return true;
  });
  ipcMain.handle(IPC.ToolboxClose, () => {
    closeOverlayAndNotify();
    return false;
  });

  // ── Dolphin drag ───────────────────────────────────────────────────────────
  ipcMain.on(IPC.DolphinMoveStart, (_e, { x, y }: { x: number; y: number }) => {
    dolphinMoveStart(x, y);
  });
  ipcMain.on(IPC.DolphinMove, () => {
    // Use system cursor position for smooth dragging
    const p = screen.getCursorScreenPoint();
    dolphinMove(p.x, p.y);
  });
  ipcMain.on(IPC.DolphinMoveEnd, () => {
    dolphinMoveEnd();
  });

  // ── Settings ───────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SettingsGet, (): Settings => getSettings());
  ipcMain.handle(IPC.SettingsSet, (_e, partial: Partial<Settings>) => {
    const before = getSettings();
    const after = setSettings(partial);
    if (after.shortcut !== before.shortcut) registerShortcut(after.shortcut);
    broadcast(IPC.SettingsChanged, after);
    return after;
  });

  // ── Sheets ─────────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SheetList, () => listSheets());
  ipcMain.handle(IPC.SheetGet, (_e, id: number | null) => {
    if (id === null || id === undefined) return getOrCreateLatestSheet();
    return getSheet(id);
  });
  ipcMain.handle(IPC.SheetCreate, (_e, args: { title: string; displayDate: string | null }) => createSheet(args));
  ipcMain.handle(IPC.SheetUpdate, (_e, sheet: Sheet) => updateSheet(sheet));
  ipcMain.handle(IPC.SheetDelete, (_e, id: number) => {
    deleteSheet(id);
    return true;
  });

  // ── Scratchpad files ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.ScratchpadOpen, async (): Promise<string | null> => {
    const ov = getOverlayWindow();
    const result = await dialog.showOpenDialog(ov!, {
      title: 'Open Markdown',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    try {
      return fs.readFileSync(result.filePaths[0], 'utf8');
    } catch (err) {
      console.error('Failed to read file:', err);
      return null;
    }
  });
  ipcMain.handle(IPC.ScratchpadSave, async (_e, content: string): Promise<boolean> => {
    const ov = getOverlayWindow();
    const result = await dialog.showSaveDialog(ov!, {
      title: 'Save Markdown',
      defaultPath: 'scratchpad.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return false;
    try {
      fs.writeFileSync(result.filePath, content, 'utf8');
      return true;
    } catch (err) {
      console.error('Failed to write file:', err);
      return false;
    }
  });

  // ── Timer pill broadcast ───────────────────────────────────────────────────
  ipcMain.on(IPC.TimerBroadcast, (_e, state) => {
    const dolphin = getDolphinWindow();
    dolphin?.webContents.send(IPC.TimerTick, state);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDolphinWindow();
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep app alive on Windows even when windows are hidden — tray-like behavior.
});

app.on('will-quit', () => {
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
});
