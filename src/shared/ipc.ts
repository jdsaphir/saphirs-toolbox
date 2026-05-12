// IPC channel names — single source of truth for main/preload/renderer.

export const IPC = {
  // Toolbox visibility
  ToolboxToggle: 'toolbox:toggle',
  ToolboxOpen: 'toolbox:open',
  ToolboxClose: 'toolbox:close',
  ToolboxState: 'toolbox:state', // main -> renderer: { open: boolean }

  // Dolphin drag (renderer -> main)
  DolphinMoveStart: 'dolphin:move-start',
  DolphinMove: 'dolphin:move',
  DolphinMoveEnd: 'dolphin:move-end',
  DolphinPosition: 'dolphin:position', // main -> dolphin renderer: persisted pos

  // Settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsChanged: 'settings:changed', // main -> all renderers

  // Sheets / todos
  SheetList: 'sheet:list',
  SheetGet: 'sheet:get',
  SheetCreate: 'sheet:create',
  SheetUpdate: 'sheet:update',
  SheetDelete: 'sheet:delete',

  // Scratchpad files
  ScratchpadOpen: 'scratchpad:open',
  ScratchpadSave: 'scratchpad:save',

  // Timer (renderer -> main for the pill broadcast)
  TimerBroadcast: 'timer:broadcast',
  TimerTick: 'timer:tick', // main -> dolphin renderer

  // App control
  AppQuit: 'app:quit',
  OpenSettingsTab: 'app:open-settings', // main -> overlay renderer
} as const;
