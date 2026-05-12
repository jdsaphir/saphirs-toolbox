import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../shared/api';
import type { Settings, Sheet, TimerState } from '../../../shared/types';
import { TodoWidget } from './TodoWidget';
import { ScratchpadWidget } from './ScratchpadWidget';
import { Calculator } from './Calculator';
import { Timer, useTimerTicker } from './Timer';
import { SettingsTool } from './SettingsTool';
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
    return () => { off1(); off2(); };
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

  // Layout: position the cluster relative to dolphin position
  const layout = useMemo(() => {
    if (!dolphinCenter || !settings) return null;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    let side: 'left' | 'right';
    if (settings.toolboxSide === 'left') side = 'left';
    else if (settings.toolboxSide === 'right') side = 'right';
    else side = dolphinCenter.x > screenW / 2 ? 'left' : 'right';
    return { side, screenW, screenH };
  }, [dolphinCenter, settings]);

  if (!open || !sheet || !settings || !layout) return <div className="overlay-root" onClick={close} />;

  // Compute cluster position. Anchor near the dolphin's vertical center,
  // extending up (todo+scratchpad above the toolbar) and to the opposite side
  // from where the toolbar grows.
  const DOLPHIN_HALF = 36;
  const TOOLBAR_HEIGHT = 48;
  const clusterMaxWidth = 730; // todo (360) + gap (10) + scratchpad (360)
  const padding = 16;

  // Toolbar row sits at the dolphin's vertical position
  // todo+scratchpad row sits above the toolbar
  const toolbarTop = Math.min(layout.screenH - TOOLBAR_HEIGHT - padding, Math.max(padding, (dolphinCenter!.y) - TOOLBAR_HEIGHT / 2));
  let leftAnchor: number;
  if (layout.side === 'right') {
    // Toolbar grows right from dolphin
    leftAnchor = Math.max(padding, dolphinCenter!.x + DOLPHIN_HALF + 8);
    if (leftAnchor + clusterMaxWidth > layout.screenW - padding) {
      leftAnchor = Math.max(padding, layout.screenW - clusterMaxWidth - padding);
    }
  } else {
    // Toolbar grows left from dolphin; right edge of cluster aligned near dolphin
    const rightEdge = Math.min(layout.screenW - padding, dolphinCenter!.x - DOLPHIN_HALF - 8);
    leftAnchor = Math.max(padding, rightEdge - clusterMaxWidth);
  }

  const clusterStyle: React.CSSProperties = {
    left: leftAnchor,
    top: padding,
    width: clusterMaxWidth,
    height: layout.screenH - 2 * padding,
    justifyContent: 'flex-end', // pin to bottom relative to toolbarTop
  };
  // Use absolute positioning for the toolbar row anchored to dolphin vertical center
  // and stack the widgets row above it.
  const toolbarStyle: React.CSSProperties = {
    position: 'absolute',
    left: leftAnchor,
    top: toolbarTop,
    width: clusterMaxWidth,
  };
  const widgetsRowStyle: React.CSSProperties = {
    position: 'absolute',
    left: leftAnchor,
    top: padding,
    width: clusterMaxWidth,
    height: toolbarTop - padding - 10,
  };

  return (
    <div className="overlay-root" onClick={close}>
      <div style={widgetsRowStyle}>
        <div className="widget-row" style={{ height: '100%', alignItems: 'stretch' }}>
          {/* When toolbar grows right (dolphin on the left), put scratchpad on the right (further from dolphin) */}
          {layout.side === 'right' ? (
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
          )}
        </div>
      </div>

      <div style={toolbarStyle}>
        <div
          className={`widget toolbar ${layout.side === 'left' ? 'right-anchored' : ''}`}
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

      {/* Active tool floats centered between cluster and screen edge */}
      {activeTool && (
        <div
          style={{
            position: 'absolute',
            left: layout.side === 'right' ? leftAnchor : Math.max(padding, leftAnchor - 240),
            top: Math.max(padding, toolbarTop - 360),
            zIndex: 50,
          }}
        >
          {activeTool === 'calculator' && <Calculator onClose={() => setActiveTool(null)} />}
          {activeTool === 'timer' && <Timer state={timerState} setState={setTimerState} onClose={() => setActiveTool(null)} />}
          {activeTool === 'settings' && <SettingsTool settings={settings} onClose={() => setActiveTool(null)} />}
        </div>
      )}
    </div>
  );
};
