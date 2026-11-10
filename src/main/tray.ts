import { app, Menu, Tray, nativeImage } from 'electron';
import path from 'path';
import { isOverlayVisible } from './windows';

let tray: Tray | null = null;
let rebuildMenu: (() => void) | null = null;

export function createTray(opts: {
  onToggleToolbox: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
  onRestartToUpdate: () => void;
  readyUpdateVersion: () => string | null;
}): Tray {
  // In dev __dirname is dist-main/main; in packaged app, resources are alongside the asar.
  // Try a few candidate paths for the tray icon.
  const candidates = [
    path.join(__dirname, '../../assets/tray.png'),
    path.join(process.resourcesPath || '', 'assets', 'tray.png'),
    path.join(app.getAppPath(), 'assets', 'tray.png'),
  ];
  let image = nativeImage.createEmpty();
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) { image = img; break; }
  }
  tray = new Tray(image);
  tray.setToolTip("Saphir's Toolbox");

  const rebuild = () => {
    // With an update downloaded, Quit installs it and leaves the app closed;
    // Restart to update installs it and reopens the app.
    const update = opts.readyUpdateVersion();
    const menu = Menu.buildFromTemplate([
      {
        label: isOverlayVisible() ? 'Hide toolbox' : 'Show toolbox',
        click: () => opts.onToggleToolbox(),
      },
      { label: 'Settings…', click: () => opts.onOpenSettings() },
      { type: 'separator' },
      ...(update ? [{ label: `Restart to update (v${update})`, click: () => opts.onRestartToUpdate() }] : []),
      { label: "Quit Saphir's Toolbox", click: () => opts.onQuit() },
    ]);
    tray!.setContextMenu(menu);
  };
  rebuildMenu = rebuild;
  rebuild();
  // Single click on the tray toggles the toolbox; right-click shows the menu.
  tray.on('click', () => {
    opts.onToggleToolbox();
    // Refresh the menu so the Show/Hide label is right next time
    setTimeout(rebuild, 50);
  });
  return tray;
}

// Rebuilds the menu, e.g. when an update becomes ready.
export function refreshTray() {
  rebuildMenu?.();
}
