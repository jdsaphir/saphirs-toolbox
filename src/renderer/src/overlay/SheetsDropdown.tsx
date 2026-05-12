import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prettyDate } from '../shared/date-format';

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
  onDelete: (id: number) => void;
  onClose: () => void;
}

export const SheetsDropdown: React.FC<Props> = ({ anchor, sheets, activeId, onSelect, onCreate, onDelete, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const initialRect = anchor.getBoundingClientRect();
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: initialRect.left,
    top: initialRect.bottom + 4,
  }));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  return createPortal(
    <div
      ref={ref}
      className="sheets-dropdown"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {sheets.map(s => {
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
              title="Delete sheet"
              onClick={e => {
                e.stopPropagation();
                if (confirm('Delete this sheet?')) onDelete(s.id);
              }}
            >×</span>
          </div>
        );
      })}
      <div className="sheet-item new-sheet" onClick={onCreate}>+ New sheet</div>
    </div>,
    document.body
  );
};
