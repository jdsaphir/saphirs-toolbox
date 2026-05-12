import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CheckboxStatus, TodoItem } from '../../../shared/types';

// Glyph rendering for each status. Returned as JSX so we can use multi-character glyphs.
export function statusGlyph(s: CheckboxStatus): React.ReactNode {
  switch (s) {
    case 'empty': return null;
    case 'in_progress': return <span className="glyph">/</span>;
    case 'done': return <span className="glyph">✓</span>;
    case 'meeting': return <span className="glyph" style={{ fontSize: 14 }}>—</span>;
    case 'deferred': return <span className="glyph">›</span>;
    case 'delegated': return <span className="glyph">‹</span>;
    case 'important': return <span className="glyph">|</span>;
    case 'comment': return <span className="glyph" style={{ fontSize: 10, letterSpacing: -1 }}>//</span>;
    case 'chevron_up': return <span className="glyph">^</span>;
    case 'chevron_down': return <span className="glyph">v</span>;
    case 'circle': return <span className="glyph">○</span>;
  }
}

export const STATUS_LIST: CheckboxStatus[] = [
  'empty', 'in_progress', 'done',
  'meeting', 'deferred', 'delegated',
  'important', 'comment', 'circle',
  'chevron_up', 'chevron_down',
];

export const STATUS_LABEL: Record<CheckboxStatus, string> = {
  empty: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  meeting: 'Meeting / call',
  deferred: 'Deferred',
  delegated: 'Delegated',
  important: 'Important',
  comment: 'Comment',
  chevron_up: 'Chevron up (reserved)',
  chevron_down: 'Chevron down (reserved)',
  circle: 'Circle (reserved)',
};

// Common statuses for click-cycle mode
const CYCLE_ORDER: CheckboxStatus[] = ['empty', 'in_progress', 'done'];

export const Checkbox: React.FC<{
  item: TodoItem;
  mode: 'palette' | 'cycle';
  onChange: (item: TodoItem) => void;
  onOpenPalette: (anchor: HTMLElement) => void;
}> = ({ item, mode, onChange, onOpenPalette }) => {
  const ref = useRef<HTMLDivElement>(null);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (mode === 'palette') {
      if (ref.current) onOpenPalette(ref.current);
    } else {
      // cycle
      const idx = CYCLE_ORDER.indexOf(item.status);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length] ?? 'empty';
      onChange({ ...item, status: next });
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    // Right-click always opens the palette regardless of mode
    e.preventDefault();
    e.stopPropagation();
    if (ref.current) onOpenPalette(ref.current);
  }

  return (
    <div
      ref={ref}
      className={`checkbox ${item.status}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={STATUS_LABEL[item.status]}
    >
      {statusGlyph(item.status)}
      {item.optional && <span className="notch tl" />}
      {item.personal && <span className="notch tr" />}
      {item.followUp && <span className="notch br" />}
      {item.canceled && <span className="notch bl" />}
    </div>
  );
};

export const StatusPalette: React.FC<{
  item: TodoItem;
  anchor: HTMLElement;
  onChange: (item: TodoItem) => void;
  onClose: () => void;
}> = ({ item, anchor, onChange, onClose }) => {
  // Start invisible so we don't flash at (0,0) before the layout effect runs.
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false });
  const paletteRef = useRef<HTMLDivElement>(null);
  // Stable onClose ref so the outside-click effect doesn't tear down on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!paletteRef.current) return;
    const r = anchor.getBoundingClientRect();
    const el = paletteRef.current;
    const rect = el.getBoundingClientRect();
    let left = r.right + 6;
    let top = r.top;
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, r.left - rect.width - 6);
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8);
    setPos({ left, top, ready: true });
  }, [anchor]);

  useEffect(() => {
    // Defer attaching the outside-click listener by one frame, so the click
    // that opened the palette can't immediately close it on the same tick.
    let attached = false;
    const onDown = (e: MouseEvent) => {
      if (!paletteRef.current) return;
      if (paletteRef.current.contains(e.target as Node)) return;
      if (anchor.contains(e.target as Node)) return; // clicks on the anchor toggle/reopen, not close
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
    };
    const raf = requestAnimationFrame(() => {
      window.addEventListener('mousedown', onDown);
      window.addEventListener('keydown', onKey, true);
      attached = true;
    });
    return () => {
      cancelAnimationFrame(raf);
      if (attached) {
        window.removeEventListener('mousedown', onDown);
        window.removeEventListener('keydown', onKey, true);
      }
    };
  }, [anchor]);

  function pick(status: CheckboxStatus) {
    onChange({ ...item, status });
    onClose();
  }
  function toggle<K extends keyof TodoItem>(key: K) {
    onChange({ ...item, [key]: !item[key] } as TodoItem);
  }

  return (
    <div
      ref={paletteRef}
      className="palette"
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="palette-section">
        <div className="label">Status</div>
        {STATUS_LIST.map(s => (
          <div
            key={s}
            className={`palette-cell ${item.status === s ? 'active' : ''}`}
            title={STATUS_LABEL[s]}
            onClick={() => pick(s)}
          >
            <div className={`checkbox ${s}`} style={{ width: 22, height: 22 }}>
              {statusGlyph(s)}
            </div>
          </div>
        ))}
      </div>
      <div className="palette-section">
        <div className="label">Corner notches</div>
        <div className="palette-toggle-row" style={{ gridColumn: '1 / -1' }}>
          <div className={`palette-toggle ${item.optional ? 'active' : ''}`} onClick={() => toggle('optional')} title="Top-left: Optional">◤ Optional</div>
          <div className={`palette-toggle ${item.personal ? 'active' : ''}`} onClick={() => toggle('personal')} title="Top-right: Personal">◥ Personal</div>
          <div className={`palette-toggle ${item.canceled ? 'active' : ''}`} onClick={() => toggle('canceled')} title="Bottom-left: Canceled">◣ Canceled</div>
          <div className={`palette-toggle ${item.followUp ? 'active' : ''}`} onClick={() => toggle('followUp')} title="Bottom-right: Follow up">◢ Follow up</div>
        </div>
      </div>
    </div>
  );
};
