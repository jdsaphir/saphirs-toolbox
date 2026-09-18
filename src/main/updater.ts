// Auto-update wiring. Only meaningful for the NSIS-installed build: for the
// portable build electron-updater can't replace a running .exe, and the dev
// build is unpackaged. Both report 'unsupported' so the Settings panel can say
// so instead of showing a check that would never find anything.

import { execFileSync } from 'node:child_process';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { Settings, UpdateCheckInterval, UpdateStatus } from '../shared/types';
import { visibleStatus, type ReadyUpdate } from '../shared/update-status';

const INTERVAL_MS: Record<UpdateCheckInterval, number | null> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  startup: null,
  never: null,
};

// The downloaded update, kept apart from the passing states of a check so that
// a later check can't erase it. See shared/update-status.ts.
let ready: ReadyUpdate | null = null;
let status: UpdateStatus = { state: 'idle' };
let statusListener: ((s: UpdateStatus) => void) | null = null;
let timer: NodeJS.Timeout | null = null;
let checking = false;

// The portable build runs from a temp folder that changes on every launch, so
// there is nothing for the updater to replace.
function supported(): boolean {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
}

export function onUpdateStatusChanged(listener: (s: UpdateStatus) => void): void {
  statusListener = listener;
}

export function getUpdateStatus(): UpdateStatus {
  return supported() ? visibleStatus(ready, status) : { state: 'unsupported' };
}

function setStatus(next: UpdateStatus) {
  status = next;
  statusListener?.(getUpdateStatus());
}

function reportCheckError(err: unknown): void {
  console.error('[autoUpdater]', err);
  setStatus({ state: 'error', version: status.version, error: String((err as Error)?.message ?? err) });
}

export function initAutoUpdater(settings: Settings): void {
  if (!supported()) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-available', info => setStatus({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', info => setStatus({
    state: 'up-to-date',
    version: info.version,
    checkedAt: new Date().toISOString(),
  }));
  autoUpdater.on('download-progress', p => setStatus({
    state: 'downloading',
    version: status.version,
    percent: Math.round(p.percent),
  }));
  autoUpdater.on('update-downloaded', info => {
    ready = { version: info.version, at: new Date().toISOString() };
    setStatus({ state: 'ready', version: info.version, checkedAt: ready.at });
  });
  autoUpdater.on('error', err => reportCheckError(err));

  // Every setting except 'never' still checks on launch: that is the one moment
  // an update can actually be installed, since electron-updater applies it on
  // the way out.
  if (settings.updateCheckInterval !== 'never') void checkForUpdates();
  scheduleUpdateChecks(settings.updateCheckInterval);
}

// Re-armed whenever the setting changes. Checks carry on after one update is
// downloaded: this app is meant to sit in the tray for days, long enough for
// the pending release to be superseded, and electron-updater installs whichever
// it fetched last. A re-check that finds the same release again costs one small
// request, because the downloaded file is reused rather than fetched twice.
export function scheduleUpdateChecks(interval: UpdateCheckInterval): void {
  if (timer) { clearInterval(timer); timer = null; }
  if (!supported()) return;
  const ms = INTERVAL_MS[interval];
  if (ms == null) return;
  timer = setInterval(() => { void checkForUpdates(); }, ms);
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!supported()) return getUpdateStatus();
  // A manual check while one is already running would report the same result
  // twice and confuse the status line.
  if (checking) return getUpdateStatus();
  checking = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    reportCheckError(err);
  } finally {
    checking = false;
  }
  return getUpdateStatus();
}

// An MCP bridge is this same executable run as plain Node, started from the
// install folder by whichever AI client connected to the toolbox. That client
// owns it, so it keeps running after the app quits and Windows holds the old
// files — which makes the installer's uninstall step fail with "Failed to
// uninstall old application files".
//
// electron-updater runs the installer from its `quit` handler, which fires
// after `will-quit`, so that is the last moment to clear them out. The client
// starts a fresh bridge the next time it calls the toolbox.
//
// The installer closes them too (build/installer.nsh), which is what covers an
// update landing on a version older than this one. Doing it here as well keeps
// the window between the two as short as possible.
export function closeLeftoverBridges(): void {
  if (!ready || process.platform !== 'win32') return;
  // Match on this executable plus the bridge script, so only our own bridges
  // go — never another app, and never this process or its helper children.
  const exe = process.execPath.replace(/'/g, "''");
  const script =
    `Get-CimInstance Win32_Process | Where-Object { ` +
    `$_.ProcessId -ne ${process.pid} -and $_.ExecutablePath -eq '${exe}' -and $_.CommandLine -like '*mcp-stdio*' } | ` +
    `ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; ` +
    `Wait-Process -Id $_.ProcessId -Timeout 5 -ErrorAction SilentlyContinue } catch {} }`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 10_000,
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch (err) {
    // Worst case the installer's own cleanup handles it.
    console.error('[autoUpdater] could not close the MCP bridges:', err);
  }
}
