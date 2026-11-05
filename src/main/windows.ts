import { BrowserWindow, powerMonitor, screen } from 'electron';
import path from 'path';
import { getSettings, setSettings } from './db';

const DEV = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:5173';

const DOLPHIN_SIZE = 72; // px; includes some breathing room around the icon

function iconPath(): string {
  // Look for the .ico in dev (project root/assets) and packaged (resources) locations.
  const candidates = [
    path.join(__dirname, '../../assets/icon.ico'),
    path.join(process.resourcesPath || '', 'assets', 'icon.ico'),
  ];
  for (const p of candidates) {
    try { if (require('fs').existsSync(p)) return p; } catch { /* ignore */ }
  }
  return candidates[0];
}

let dolphinWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

// Track drag state so we can move the dolphin window with the cursor.
let dragOffset: { dx: number; dy: number } | null = null;

export function getDolphinWindow(): BrowserWindow | null {
  return dolphinWindow;
}
export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

function pageUrl(file: string): string {
  if (DEV) return `${DEV_URL}/${file}`;
  return `file://${path.join(__dirname, '../../dist-renderer', file)}`;
}

export function createDolphinWindow(): BrowserWindow {
  const settings = getSettings();
  const display = screen.getPrimaryDisplay().workArea;
  const x = settings.dolphinX >= 0 ? settings.dolphinX : display.x + display.width - DOLPHIN_SIZE - 32;
  const y = settings.dolphinY >= 0 ? settings.dolphinY : display.y + Math.floor(display.height / 2);

  dolphinWindow = new BrowserWindow({
    width: DOLPHIN_SIZE,
    height: DOLPHIN_SIZE + 28, // extra room for timer pill above
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false, // we move it ourselves via IPC for drag-vs-click logic
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    icon: iconPath(),
    title: "Saphir's Toolbox",
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep IPC + setInterval working even when this window is occluded
      // by the (always-on-top) overlay. Without this, the timer pill freezes.
      backgroundThrottling: false,
    },
  });
  dolphinWindow.setAlwaysOnTop(true, 'screen-saver');
  keepPinned(dolphinWindow);
  dolphinWindow.setTitle("Saphir's Toolbox");

  dolphinWindow.loadURL(pageUrl('dolphin.html'));
  if (DEV) dolphinWindow.webContents.openDevTools({ mode: 'detach' });
  // Allow opening DevTools in production for debugging (F12 or Ctrl+Shift+I).
  dolphinWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      dolphinWindow!.webContents.toggleDevTools();
    }
  });
  return dolphinWindow;
}

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay().workArea;
  overlayWindow = new BrowserWindow({
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    icon: iconPath(),
    title: "Saphir's Toolbox",
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep the timer setInterval and IPC running smoothly even when the
      // overlay is hidden between toolbox sessions.
      backgroundThrottling: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  keepPinned(overlayWindow);
  overlayWindow.setTitle("Saphir's Toolbox");
  overlayWindow.setMenu(null);
  overlayWindow.loadURL(pageUrl('overlay.html'));
  if (DEV) overlayWindow.webContents.openDevTools({ mode: 'detach' });
  overlayWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      overlayWindow!.webContents.toggleDevTools();
    }
  });
  return overlayWindow;
}

export function showOverlay(): { center: { x: number; y: number } } {
  if (!overlayWindow) createOverlayWindow();
  const w = overlayWindow!;

  // Pick the display that contains the dolphin (multi-monitor support).
  let display = screen.getPrimaryDisplay();
  if (dolphinWindow) {
    const [dx, dy] = dolphinWindow.getPosition();
    const [dw, dh] = dolphinWindow.getSize();
    display = screen.getDisplayMatching({ x: dx, y: dy, width: dw, height: dh });
  }
  const wa = display.workArea;
  w.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });

  // Translate the dolphin's absolute screen center into display-local coords
  // so the renderer can lay out against window.innerWidth/Height.
  const abs = getDolphinScreenCenter();
  const localCenter = { x: abs.x - wa.x, y: abs.y - wa.y };

  // Re-pin the dolphin first so it is back in the topmost band before the
  // overlay is raised above it.
  pinWindow(dolphinWindow);
  w.show();
  // Windows can put a window back on the taskbar when it is shown again, even
  // with skipTaskbar set at creation, so re-apply both flags after every show.
  pinWindow(w);
  w.moveTop();
  w.focus();
  return { center: localCenter };
}

export function hideOverlay(): void {
  overlayWindow?.hide();
  // Hiding the focused overlay hands focus to another app; make sure the
  // dolphin stays above it.
  raiseDolphin();
}

export function isOverlayVisible(): boolean {
  return !!overlayWindow?.isVisible();
}

// ── Dolphin drag ─────────────────────────────────────────────────────────────

export function dolphinMoveStart(clientX: number, clientY: number): void {
  if (!dolphinWindow) return;
  const [winX, winY] = dolphinWindow.getPosition();
  // clientX/clientY are relative to the dolphin window
  dragOffset = { dx: clientX, dy: clientY };
  // Currently unused but kept for future absolute-position support
  void winX; void winY;
}

export function dolphinMove(screenX: number, screenY: number): void {
  if (!dolphinWindow || !dragOffset) return;
  dolphinWindow.setPosition(Math.round(screenX - dragOffset.dx), Math.round(screenY - dragOffset.dy));
}

export function dolphinMoveEnd(): void {
  if (!dolphinWindow) return;
  const [x, y] = dolphinWindow.getPosition();
  setSettings({ dolphinX: x, dolphinY: y });
  dragOffset = null;
}

export function getDolphinScreenCenter(): { x: number; y: number } {
  if (!dolphinWindow) return { x: 0, y: 0 };
  const [x, y] = dolphinWindow.getPosition();
  const [w, h] = dolphinWindow.getSize();
  return { x: x + w / 2, y: y + h / 2 };
}

// ── Keeping the windows topmost and off the taskbar ─────────────────────────
//
// Windows drops a window's topmost state or its "no taskbar button" state in
// several situations Electron doesn't report: Explorer restarting, sleep and
// resume, display changes, Show Desktop, fullscreen apps, or another topmost
// window being raised over ours. Electron still believes the flags are set, so
// we re-apply them on those events and on a slow heartbeat.

const WATCHDOG_MS = 3000;
let watchdog: NodeJS.Timeout | null = null;

function alive(w: BrowserWindow | null): w is BrowserWindow {
  return !!w && !w.isDestroyed();
}

function pinWindow(w: BrowserWindow | null): void {
  if (!alive(w)) return;
  w.setSkipTaskbar(true);
  w.setAlwaysOnTop(true, 'screen-saver');
}

function keepPinned(w: BrowserWindow): void {
  // If anything turns always-on-top off, turn it straight back on.
  w.on('always-on-top-changed', (_e, isOnTop) => {
    if (!isOnTop) pinWindow(w);
  });
  w.on('show', () => pinWindow(w));
  w.on('restore', () => pinWindow(w));
}

/** Put the dolphin back on top of every other app, unless the overlay is open. */
function raiseDolphin(): void {
  if (!alive(dolphinWindow)) return;
  pinWindow(dolphinWindow);
  if (!dolphinWindow.isVisible() || dolphinWindow.isMinimized()) dolphinWindow.showInactive();
  // While the overlay is open it sits above the dolphin on purpose; don't
  // reorder the two.
  if (!isOverlayVisible()) dolphinWindow.moveTop();
}

export function reassertWindowFlags(): void {
  raiseDolphin();
  if (alive(overlayWindow)) {
    overlayWindow.setSkipTaskbar(true);
    if (overlayWindow.isVisible()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.moveTop();
    }
  }
}

export function startWindowWatchdog(): void {
  if (watchdog) return;
  // Some of these fire before Windows has finished settling, so check again
  // shortly after as well.
  const soon = () => {
    reassertWindowFlags();
    setTimeout(reassertWindowFlags, 1000);
  };
  powerMonitor.on('resume', soon);
  powerMonitor.on('unlock-screen', soon);
  screen.on('display-added', soon);
  screen.on('display-removed', soon);
  screen.on('display-metrics-changed', soon);
  watchdog = setInterval(reassertWindowFlags, WATCHDOG_MS);
}

export function stopWindowWatchdog(): void {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}
