import { BrowserWindow, screen } from 'electron';
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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dolphinWindow.setAlwaysOnTop(true, 'screen-saver');

  dolphinWindow.loadURL(pageUrl('dolphin.html'));
  if (DEV) dolphinWindow.webContents.openDevTools({ mode: 'detach' });
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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setMenu(null);
  overlayWindow.loadURL(pageUrl('overlay.html'));
  if (DEV) overlayWindow.webContents.openDevTools({ mode: 'detach' });
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

  w.show();
  w.focus();
  return { center: localCenter };
}

export function hideOverlay(): void {
  overlayWindow?.hide();
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
