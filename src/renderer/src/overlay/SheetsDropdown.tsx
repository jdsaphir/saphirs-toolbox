import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prettyDate } from '../../../shared/date-format';
import {
  groupCards, groupKeysFor, newCardTargets, OLDER_KEY, UNDATED_KEY,
  type NewCardTarget,
} from '../../../shared/card-history';

// The history of to-do cards ("sheets" in code). The interface calls them cards.

export interface SheetSummary {
  id: number;
  title: string;
  displayDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  anchor: HTMLElement;
  sheets: SheetSummary[];
  activeId: number;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onCreateFor: (target: NewCardTarget) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

// Which collapsible groups are open, remembered between openings.
const OPEN_KEY = 'cards-dropdown-open-groups';

function loadOpen(): Set<string> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((k: unknown) => typeof k === 'string') : []);
  } catch { return new Set(); }
}

function saveOpen(open: Set<string>): void {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch { /* not critical */ }
}

export const SheetsDropdown: React.FC<Props> = ({ anchor, sheets, activeId, onSelect, onCreate, onCreateFor, onDelete, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const initialRect = anchor.getBoundingClientRect();
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: initialRect.left,
    top: initialRect.bottom + 4,
  }));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const today = useMemo(() => new Date(), []);
  const history = useMemo(() => groupCards(sheets, today), [sheets, today]);
  const targets = useMemo(() => newCardTargets(sheets, today), [sheets, today]);

  // Open the groups that hold the active card, so it is always visible.
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = loadOpen();
    for (const k of groupKeysFor(history, activeId)) s.add(k);
    return s;
  });
  useEffect(() => { saveOpen(open); }, [open]);

  function toggle(key: string) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = anchor.getBoundingClientRect();
    const rect = ref.current.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 4;
    // Anchor to button's right edge instead if we'd overflow the viewport
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, r.right - rect.width);
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, r.top - rect.height - 4);
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
    // Bring the active card into view (it may be deep in the tree)
    ref.current.querySelector('.sheet-item.active')?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    let attached = false;
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
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

  const item = (s: SheetSummary) => {
    const label = s.title.trim() ? s.title : '(untitled)';
    const pretty = prettyDate(s.displayDate);
    return (
      <div
        key={s.id}
        className={`sheet-item ${s.id === activeId ? 'active' : ''}`}
        onClick={() => onSelect(s.id)}
      >
        <span className="label-text" title={pretty || label}>
          {pretty || label}
        </span>
        <span
          className="del"
          title="Delete card"
          onClick={e => {
            e.stopPropagation();
            if (confirm('Delete this card?')) onDelete(s.id);
          }}
        >×</span>
      </div>
    );
  };

  const group = (key: string, label: string, count: number, children: () => React.ReactNode) => {
    const isOpen = open.has(key);
    return (
      <div key={key} className="card-group">
        <button type="button" className="card-group-head" onClick={() => toggle(key)} aria-expanded={isOpen}>
          <span className="caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          <span className="label-text">{label}</span>
          <span className="count">{count}</span>
        </button>
        {isOpen && <div className="card-group-body">{children()}</div>}
      </div>
    );
  };

  const olderCount = history.older.reduce((n, y) => n + y.weeks.reduce((m, w) => m + w.cards.length, 0), 0);

  return createPortal(
    <div
      ref={ref}
      className="sheets-dropdown"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {targets.map(t => (
        <div
          key={t.iso}
          className="sheet-item new-sheet"
          title={t.copyDeferredFrom ? "Also copies today's deferred (>) to-dos" : undefined}
          onClick={() => onCreateFor(t)}
        >+ New card for {t.label}</div>
      ))}
      <div className="sheet-item new-sheet" title="An empty card with no date" onClick={onCreate}>+ New card</div>
      <div className="cards-divider" />
      {history.recent.map(item)}
      {olderCount > 0 && group(OLDER_KEY, 'Older cards', olderCount, () =>
        history.older.map(y => group(y.key, String(y.year), y.weeks.reduce((n, w) => n + w.cards.length, 0), () =>
          y.weeks.map(w => group(w.key, `Week ${w.week}`, w.cards.length, () => w.cards.map(item)))
        ))
      )}
      {history.undated.length > 0 && group(UNDATED_KEY, 'Undated', history.undated.length, () => history.undated.map(item))}
    </div>,
    document.body
  );
};
