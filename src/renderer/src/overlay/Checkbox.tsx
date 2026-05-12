import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Handle on mousedown rather than click. The window-level mousedown listener
  // attached by an open palette/dropdown would otherwise fire before our click
  // event lands, potentially eating it. Using mousedown here makes the
  // sequence: our handler fires first, opens the palette, the new palette's
  // listener is then attached (deferred by rAF inside StatusPalette).
  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (mode === 'palette') {
      if (ref.current) onOpenPalette(ref.current);
    } else {
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
      onMouseDown={handleMouseDown}
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
  // Compute initial position synchronously from the anchor so the palette
  // paints in the right place on first render (no flash at 0,0). The
  // post-mount layout effect can refine if it overflows the viewport.
  const initialRect = anchor.getBoundingClientRect();
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: initialRect.right + 6,
    top: initialRect.top,
  }));
  const paletteRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!paletteRef.current) return;
    const r = anchor.getBoundingClientRect();
    const rect = paletteRef.current.getBoundingClientRect();
    let left = r.right + 6;
    let top = r.top;
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, r.left - rect.width - 6);
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8);
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    // Use mousedown in capture phase, deferred by one frame so the same-tick
    // event that opened the palette can't close it.
    let attached = false;
    const onDown = (e: MouseEvent) => {
      if (!paletteRef.current) return;
      if (paletteRef.current.contains(e.target as Node)) return;
      if (anchor.contains(e.target as Node)) return;
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

  // Render via a portal so the palette is a direct child of document.body —
  // no ancestor positioning context, no z-index inheritance, no overflow:hidden
  // clipping can interfere with where it appears.
  return createPortal(
    <div
      ref={paletteRef}
      className="palette"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
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
    </div>,
    document.body
  );
};
