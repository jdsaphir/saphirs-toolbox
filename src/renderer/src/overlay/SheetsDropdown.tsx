import React, { useEffect, useRef, useState } from 'react';
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
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  return (
    <div ref={ref} className="sheets-dropdown" style={{ left: pos.left, top: pos.top }} onClick={e => e.stopPropagation()}>
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
    </div>
  );
};
