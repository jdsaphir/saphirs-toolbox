import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, screen, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IPC } from '../shared/ipc';
import { createTray } from './tray';
import {
  checkForUpdates,
  closeLeftoverBridges,
  getUpdateStatus,
  initAutoUpdater,
  onUpdateStatusChanged,
  scheduleUpdateChecks,
} from './updater';
import {
  createSheet,
  deleteSheet,
  getOrCreateLatestSheet,
  getPermanentScratchpad,
  getSettings,
  getSheet,
  initDb,
  listSheets,
  setPermanentScratchpad,
  setSettings,
  updateSheet,
} from './db';
import {
  createDolphinWindow,
  createOverlayWindow,
  dolphinMove,
  dolphinMoveEnd,
  dolphinMoveStart,
  getDolphinWindow,
  getOverlayWindow,
  hideOverlay,
  isOverlayVisible,
  showOverlay,
} from './windows';
import { DataChange, Settings, Sheet, TimerState } from '../shared/types';
import type { TimerAction } from '../shared/timer-actions';
import { getAgentActivity, initAgentExecutor, runAgentTool } from './agent/executor';
import { initRendererRequests, requestRenderer, whenOverlayReady } from './agent/renderer-requests';
import {
  configureAgentServer,
  generateAgentToken,
  getAgentServerStatus,
  onAgentStatusChanged,
  shutdownAgentServer,
} from './agent/server';

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
  const { center } = showOverlay();
  // Tell renderers (dolphin + overlay) the overlay is open and where the
  // dolphin sits in the overlay's local coordinate space.
  broadcast(IPC.ToolboxState, { open: true, dolphinCenter: center });
}

function closeOverlayAndNotify() {
  hideOverlay();
  broadcast(IPC.ToolboxState, { open: false });
}

// Links in the notes previews are plain <a> tags. Left alone, a click loads the
// site inside the full-screen overlay itself (or a new bare window for Ctrl- and
// middle-clicks). Send web and mail links to the default apps and file links to
// the file's default app instead, and close the overlay so what opens isn't
// hidden behind it, but only once something has actually opened. Anything else
// is ignored.
async function openLinkExternally(url: string) {
  let protocol: string;
  try { protocol = new URL(url).protocol; } catch { return; }
  if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
    try { await shell.openExternal(url); } catch (err) { console.error('Failed to open link:', err); return; }
  } else if (protocol === 'file:') {
    const file = openableFilePath(url);
    if (!file) return;
    const err = await shell.openPath(file);
    if (err) { console.error('Failed to open file:', file, err); return; }
  } else {
    return;
  }
  if (isOverlayVisible()) closeOverlayAndNotify();
}

// Opening a file link runs whatever the file's default action is, and notes can
// come from opened .md files or AI agents. So file types that Windows runs
// (programs, scripts, installers, shortcuts, and anything else in PATHEXT) are
// refused, as is anything on a network share. Other files and folders open.
const BLOCKED_FILE_TYPES = new Set([
  '.exe', '.com', '.scr', '.pif', '.bat', '.cmd', '.ps1', '.psm1', '.psd1', '.ps1xml', '.psc1',
  '.vb', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ws', '.wsc', '.sct', '.hta', '.chm',
  '.hlp', '.msc', '.cpl', '.msi', '.msp', '.mst', '.msix', '.msixbundle', '.appx', '.appxbundle',
  '.appinstaller', '.application', '.appref-ms', '.gadget', '.diagcab', '.jar', '.reg', '.inf',
  '.scf', '.lnk', '.url', '.website', '.settingcontent-ms', '.search-ms', '.library-ms',
  '.py', '.pyw', '.pyc', '.pyo', '.pyz', '.pyzw', '.pl', '.rb', '.rbw', '.tcl', '.ahk', '.au3',
  '.xll', '.xlam', '.ppam', '.iqy', '.slk',
  ...(process.env.PATHEXT ?? '').toLowerCase().split(';').filter(Boolean),
]);

function openableFilePath(url: string): string | null {
  let file: string;
  try { file = fileURLToPath(url); } catch { return null; }
  if (file.startsWith('\\\\')) return null; // network share (\\server\share)
  // A colon past the drive letter names an alternate data stream (x.txt:y.exe).
  if (file.indexOf(':', 2) !== -1) return null;
  // Relative links are dropped when notes are rendered; this catches any that
  // still point into the app's own files.
  if (!path.relative(app.getAppPath(), file).startsWith('..')) return null;
  // Windows ignores trailing dots and spaces, so "run.exe. " is run.exe.
  const type = path.extname(file.replace(/[. ]+$/, '')).toLowerCase();
  if (BLOCKED_FILE_TYPES.has(type)) {
    console.error('Refusing to open program or script from a note link:', file);
    return null;
  }
  return file;
}

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void openLinkExternally(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    e.preventDefault();
    void openLinkExternally(url);
  });
});

function quitApp() {
  // Unregister shortcuts and let the app exit cleanly
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  app.quit();
}

function broadcast<T>(channel: string, payload: T) {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

// Name shown in Task Manager / window menus.
app.setName("Saphir's Toolbox");

// Ensure only one instance can run at a time. If a second is launched, focus
// the existing dolphin so the user sees the running app instead of two.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const dw = getDolphinWindow();
    if (dw) {
      if (dw.isMinimized()) dw.restore();
      dw.show();
      dw.focus();
    }
  });
}

app.whenReady().then(() => {
  initDb();
  if (!getSettings().agentApiToken) setSettings({ agentApiToken: generateAgentToken() });
  const settings = getSettings();

  createDolphinWindow();
  createOverlayWindow();
  registerShortcut(settings.shortcut);

  createTray({
    onToggleToolbox: () => toggleOverlay(),
    onOpenSettings: () => {
      openOverlay();
      const ov = getOverlayWindow();
      ov?.webContents.send(IPC.OpenSettingsTab);
    },
    onQuit: () => quitApp(),
  });

  // Auto-update: only meaningful for the NSIS-installed build. For the
  // portable build, electron-updater can't replace a running .exe so this
  // call is effectively a no-op (it logs an error and moves on). The dev
  // build is unpackaged and skipped entirely.
  initAutoUpdater(settings);
  onUpdateStatusChanged(st => broadcast(IPC.UpdateStatusChanged, st));

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
    if (after.agentApiEnabled !== before.agentApiEnabled || after.agentApiPort !== before.agentApiPort) {
      configureAgentServer(after);
    }
    if (after.updateCheckInterval !== before.updateCheckInterval) {
      scheduleUpdateChecks(after.updateCheckInterval);
    }
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

  // ── Permanent scratchpad ───────────────────────────────────────────────────
  ipcMain.handle(IPC.PermanentScratchpadGet, () => getPermanentScratchpad());
  ipcMain.handle(IPC.PermanentScratchpadSet, (_e, content: string) => {
    setPermanentScratchpad(content);
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

  // ── App control ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AppQuit, () => {
    quitApp();
    return true;
  });
  ipcMain.handle(IPC.AppVersion, () => app.getVersion());
  ipcMain.handle(IPC.UpdateStatusGet, () => getUpdateStatus());
  ipcMain.handle(IPC.UpdateCheckNow, () => checkForUpdates());

  ipcMain.handle(IPC.ClipboardWrite, (_e, text: string) => {
    clipboard.writeText(text);
    return true;
  });

  // ── Agent access ───────────────────────────────────────────────────────────
  initRendererRequests();
  initAgentExecutor({
    // Best effort: if the overlay can't answer, run the command anyway.
    flushRenderer: () => requestRenderer<void>('flush', null, 1500).catch(() => undefined),
    notifyChanged: (change: DataChange) => getOverlayWindow()?.webContents.send(IPC.DataChanged, change),
    timer: (action: TimerAction | null) => requestRenderer<TimerState>('timer', action, 3000),
    showSheet: async (sheetId: number) => {
      await whenOverlayReady(5000);
      openOverlay();
      getOverlayWindow()?.webContents.send(IPC.AgentShowSheet, sheetId);
    },
    onActivity: entry => broadcast(IPC.AgentActivity, entry),
  });
  onAgentStatusChanged(status => broadcast(IPC.AgentStatusChanged, status));
  configureAgentServer(settings);

  // Commands pasted into the Agent Console. Errors come back as values: a
  // rejected invoke would wrap the message in Electron's own text.
  ipcMain.handle(IPC.AgentRunTool, async (_e, call: { tool: string; args: unknown }) => {
    try {
      return { ok: true, result: await runAgentTool(call.tool, call.args, 'console') };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle(IPC.AgentStatus, () => getAgentServerStatus());
  ipcMain.handle(IPC.AgentRegenerateToken, async () => {
    const after = setSettings({ agentApiToken: generateAgentToken() });
    broadcast(IPC.SettingsChanged, after);
    await configureAgentServer(after);
    return getAgentServerStatus();
  });
  ipcMain.handle(IPC.AgentActivityList, () => getAgentActivity());

  // Renderer (dolphin) asks the toolbox to open and jump to a specific tool.
  ipcMain.on(IPC.RequestOpenTool, (_e, tool: string) => {
    openOverlay();
    const ov = getOverlayWindow();
    ov?.webContents.send(IPC.OpenToolTab, tool);
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
  shutdownAgentServer();
  // Last moment before electron-updater hands over to the installer.
  closeLeftoverBridges();
});
