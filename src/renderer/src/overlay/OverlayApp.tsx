import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../shared/api';
import type { Settings, Sheet, TimerState } from '../../../shared/types';
import { TodoWidget } from './TodoWidget';
import { ScratchpadWidget } from './ScratchpadWidget';
import { Calculator } from './Calculator';
import { Timer, useTimerTicker } from './Timer';
import { SettingsTool } from './SettingsTool';
import { DraggableWindow } from './DraggableWindow';
import type { SheetSummary } from './SheetsDropdown';

type ToolId = 'calculator' | 'timer' | 'settings' | null;

const TOOLBAR_TOOLS: Array<{ id: NonNullable<ToolId>; label: string; icon: string }> = [
  { id: 'calculator', label: 'Calculator', icon: '🧮' },
  { id: 'timer', label: 'Timer', icon: '⏱' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export const OverlayApp: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [dolphinCenter, setDolphinCenter] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>(null);
  const [timerState, setTimerState] = useState<TimerState>({ mode: 'stopwatch', running: false, seconds: 0 });

  // Mount: load settings + latest sheet + sheet list
  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getSheet(null).then(s => {
      if (s) setSheet(s);
      api.listSheets().then(setSheets);
    });
    const off1 = api.onSettingsChanged(setSettings);
    const off2 = api.onToolboxState(s => {
      setOpen(s.open);
      if (s.dolphinCenter) setDolphinCenter(s.dolphinCenter);
      if (s.open) {
        // Refresh sheets in case anything changed externally
        api.listSheets().then(setSheets);
      } else {
        setActiveTool(null);
      }
    });
    const off3 = api.onOpenSettingsTab(() => setActiveTool('settings'));
    return () => { off1(); off2(); off3(); };
  }, []);

  // Run the timer tick regardless of overlay visibility
  useTimerTicker(timerState, setTimerState);

  // Persist sheet edits debounced
  const persistTimerRef = useRef<number | null>(null);
  const persistSheet = useCallback((s: Sheet) => {
    setSheet(s);
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      api.updateSheet(s).then(saved => {
        // Update sheet list summary (title/date may have changed)
        setSheets(list => list.map(it => it.id === saved.id
          ? { id: saved.id, title: saved.title, displayDate: saved.displayDate, createdAt: saved.createdAt, updatedAt: saved.updatedAt }
          : it));
      });
    }, 250);
  }, []);

  function flushPersist() {
    if (persistTimerRef.current && sheet) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
      api.updateSheet(sheet);
    }
  }

  async function selectSheet(id: number) {
    flushPersist();
    const s = await api.getSheet(id);
    if (s) setSheet(s);
  }
  async function createSheet() {
    flushPersist();
    const created = await api.createSheet({ title: '', displayDate: null });
    setSheet(created);
    const list = await api.listSheets();
    setSheets(list);
  }
  async function deleteSheet(id: number) {
    await api.deleteSheet(id);
    const list = await api.listSheets();
    setSheets(list);
    if (sheet?.id === id) {
      // load latest remaining, or create one
      const latest = await api.getSheet(null);
      if (latest) setSheet(latest);
    }
  }

  // Close handlers
  const close = useCallback(() => { flushPersist(); api.closeToolbox(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        // If a tool is open, prefer to close just the tool
        if (activeTool) { setActiveTool(null); return; }
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activeTool, close]);

  // Layout: position the cluster relative to dolphin position.
  // dolphinCenter is in overlay-local coords (main process translates from
  // absolute screen coords when picking the display), so comparisons against
  // window.innerWidth/Height work on any monitor.
  const layout = useMemo(() => {
    if (!dolphinCenter || !settings) return null;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const PADDING = 16;
    const DOLPHIN_HALF = 36;
    const TOOLBAR_H = 48;
    const CLUSTER_W = 730; // todo (360) + gap (10) + scratchpad (360)
    const GAP = 10;

    // Horizontal side: 'right' means the cluster (toolbar + widgets) grows
    // rightward from the dolphin (so dolphin is on the LEFT half). 'left'
    // means it grows leftward (dolphin on the RIGHT half).
    let side: 'left' | 'right';
    if (settings.toolboxSide === 'left') side = 'left';
    else if (settings.toolboxSide === 'right') side = 'right';
    else side = dolphinCenter.x > W / 2 ? 'left' : 'right';

    // Cluster horizontal position (the widgets row and toolbar share this band).
    let clusterLeft: number;
    if (side === 'right') {
      clusterLeft = Math.max(PADDING, dolphinCenter.x + DOLPHIN_HALF + 8);
      if (clusterLeft + CLUSTER_W > W - PADDING) clusterLeft = Math.max(PADDING, W - CLUSTER_W - PADDING);
    } else {
      const rightEdge = Math.min(W - PADDING, dolphinCenter.x - DOLPHIN_HALF - 8);
      clusterLeft = Math.max(PADDING, rightEdge - CLUSTER_W);
    }
    const clusterRight = clusterLeft + CLUSTER_W;

    // Toolbar vertically aligned with the dolphin's center.
    let toolbarTop = dolphinCenter.y - TOOLBAR_H / 2;
    toolbarTop = Math.max(PADDING, Math.min(toolbarTop, H - TOOLBAR_H - PADDING));

    // Widgets go above the toolbar if there's more room above, else below.
    const spaceAbove = toolbarTop - PADDING;
    const spaceBelow = H - (toolbarTop + TOOLBAR_H) - PADDING;
    const widgetsAbove = spaceAbove >= spaceBelow;

    return {
      side, W, H, PADDING, DOLPHIN_HALF, TOOLBAR_H, CLUSTER_W, GAP,
      clusterLeft, clusterRight, toolbarTop, widgetsAbove, spaceAbove, spaceBelow,
    };
  }, [dolphinCenter, settings]);

  if (!open || !sheet || !settings || !layout) return <div className="overlay-root" onClick={close} />;

  const L = layout;

  // Widgets row — intrinsic height; anchored by `bottom` when above the
  // toolbar, `top` when below. The widgetsAbove/below choice already picks
  // the side with the most room.
  const widgetsStyle: React.CSSProperties = L.widgetsAbove
    ? { position: 'absolute', left: L.clusterLeft, width: L.CLUSTER_W, bottom: L.H - L.toolbarTop + L.GAP }
    : { position: 'absolute', left: L.clusterLeft, width: L.CLUSTER_W, top: L.toolbarTop + L.TOOLBAR_H + L.GAP };

  // Toolbar — anchored at the dolphin-side edge of the cluster.
  const toolbarStyle: React.CSSProperties = L.side === 'right'
    ? { position: 'absolute', left: L.clusterLeft, top: L.toolbarTop }
    : { position: 'absolute', right: L.W - L.clusterRight, top: L.toolbarTop };

  // Active tool — appears beside the toolbar buttons, growing away from the
  // dolphin, vertically aligned with the toolbar. If the tool would overflow
  // the screen, it nudges back inside via the clamp below.
  const TOOL_W = 240;
  const TOOL_OFFSET = 160; // approximate width of the toolbar buttons row + gap
  let toolLeft: number;
  if (L.side === 'right') {
    toolLeft = Math.min(L.W - TOOL_W - L.PADDING, L.clusterLeft + TOOL_OFFSET);
  } else {
    toolLeft = Math.max(L.PADDING, L.clusterRight - TOOL_OFFSET - TOOL_W);
  }
  // Vertically: try to align so the tool sits above the toolbar if widgets are
  // below, and below the toolbar if widgets are above.
  const toolTop = L.widgetsAbove
    ? Math.min(L.H - 360 - L.PADDING, L.toolbarTop + L.TOOLBAR_H + L.GAP)
    : Math.max(L.PADDING, L.toolbarTop - 360 - L.GAP);

  const renderWidgets = () => (
    L.side === 'right' ? (
      <>
        <TodoWidget
          sheet={sheet}
          sheets={sheets}
          checkboxMode={settings.checkboxMode}
          onChange={persistSheet}
          onSelectSheet={selectSheet}
          onCreateSheet={createSheet}
          onDeleteSheet={deleteSheet}
        />
        <ScratchpadWidget value={sheet.scratchpad} onChange={v => persistSheet({ ...sheet, scratchpad: v })} />
      </>
    ) : (
      <>
        <ScratchpadWidget value={sheet.scratchpad} onChange={v => persistSheet({ ...sheet, scratchpad: v })} />
        <TodoWidget
          sheet={sheet}
          sheets={sheets}
          checkboxMode={settings.checkboxMode}
          onChange={persistSheet}
          onSelectSheet={selectSheet}
          onCreateSheet={createSheet}
          onDeleteSheet={deleteSheet}
        />
      </>
    )
  );

  return (
    <div className="overlay-root" onClick={close}>
      <div style={widgetsStyle}>
        <div className="widget-row">{renderWidgets()}</div>
      </div>

      <div style={toolbarStyle}>
        <div
          className="widget toolbar"
          onClick={e => e.stopPropagation()}
          style={{ display: 'inline-flex', padding: 6 }}
        >
          {TOOLBAR_TOOLS.map(t => (
            <button
              key={t.id}
              className={`toolbar-btn ${activeTool === t.id ? 'active' : ''}`}
              onClick={() => setActiveTool(curr => curr === t.id ? null : t.id)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>

      {activeTool && (
        <DraggableWindow
          initialLeft={toolLeft}
          initialTop={toolTop}
          resetKey={activeTool}
        >
          {activeTool === 'calculator' && <Calculator onClose={() => setActiveTool(null)} />}
          {activeTool === 'timer' && <Timer state={timerState} setState={setTimerState} onClose={() => setActiveTool(null)} />}
          {activeTool === 'settings' && <SettingsTool settings={settings} onClose={() => setActiveTool(null)} />}
        </DraggableWindow>
      )}
    </div>
  );
};
