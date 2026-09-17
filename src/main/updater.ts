// Auto-update wiring. Only meaningful for the NSIS-installed build: for the
// portable build electron-updater can't replace a running .exe, and the dev
// build is unpackaged, so index.ts skips both.

import { execFileSync } from 'node:child_process';
import { autoUpdater } from 'electron-updater';

let updateReady = false;

export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', err => console.error('[autoUpdater]', err));
  autoUpdater.on('update-downloaded', () => { updateReady = true; });
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('[autoUpdater] check failed:', err);
  });
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
  if (!updateReady || process.platform !== 'win32') return;
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
