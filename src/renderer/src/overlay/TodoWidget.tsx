import React, { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import { parseDateInput, prettyDate } from '../shared/date-format';
import type { CheckboxInteractionMode, Sheet, TodoItem } from '../../../shared/types';
import { Checkbox, StatusPalette } from './Checkbox';
import { SheetsDropdown, SheetSummary } from './SheetsDropdown';

interface Props {
  sheet: Sheet;
  sheets: SheetSummary[];
  checkboxMode: CheckboxInteractionMode;
  onChange: (s: Sheet) => void;
  onSelectSheet: (id: number) => void;
  onCreateSheet: () => void;
  onDeleteSheet: (id: number) => void;
}

export const TodoWidget: React.FC<Props> = ({
  sheet, sheets, checkboxMode, onChange, onSelectSheet, onCreateSheet, onDeleteSheet,
}) => {
  const [dateInput, setDateInput] = useState(sheet.title);
  const [palette, setPalette] = useState<{ idx: number; anchor: HTMLElement } | null>(null);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const sheetsBtnRef = useRef<HTMLButtonElement>(null);
  const dragFromRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => { setDateInput(sheet.title); }, [sheet.id]);

  function commitDate(s: string) {
    const iso = parseDateInput(s);
    onChange({ ...sheet, title: s, displayDate: iso });
  }

  function updateTodo(idx: number, item: TodoItem) {
    const todos = sheet.todos.slice();
    todos[idx] = item;
    onChange({ ...sheet, todos });
  }

  function moveTodo(from: number, to: number) {
    if (from === to) return;
    const todos = sheet.todos.slice();
    const [item] = todos.splice(from, 1);
    todos.splice(to, 0, item);
    onChange({ ...sheet, todos });
  }

  // Sheet navigation: sheets list is sorted desc; "previous" = older = next index
  const sheetIdx = sheets.findIndex(s => s.id === sheet.id);
  function goPrev() {
    if (sheetIdx < 0 || sheetIdx === sheets.length - 1) return;
    onSelectSheet(sheets[sheetIdx + 1].id);
  }
  function goNext() {
    if (sheetIdx <= 0) return;
    onSelectSheet(sheets[sheetIdx - 1].id);
  }

  return (
    <div className="widget todo-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header">
        <span className="title">To-do</span>
        <div className="actions">
          <button ref={sheetsBtnRef} className="ghost icon" title="Sheets" onClick={() => setSheetsOpen(o => !o)}>≡</button>
        </div>
      </div>
      {sheetsOpen && sheetsBtnRef.current && (
        <SheetsDropdown
          anchor={sheetsBtnRef.current}
          sheets={sheets}
          activeId={sheet.id}
          onSelect={id => { setSheetsOpen(false); onSelectSheet(id); }}
          onCreate={() => { setSheetsOpen(false); onCreateSheet(); }}
          onDelete={id => onDeleteSheet(id)}
          onClose={() => setSheetsOpen(false)}
        />
      )}
      <div className="todo-date-row">
        <button className="nav-btn ghost" onClick={goPrev} disabled={sheetIdx < 0 || sheetIdx === sheets.length - 1} title={sheetIdx < 0 || sheetIdx === sheets.length - 1 ? 'No older sheet' : 'Older sheet'}>‹</button>
        <input
          className="date-input"
          type="text"
          value={dateInput}
          placeholder="M/D/YYYY"
          onChange={e => setDateInput(e.target.value)}
          onBlur={() => commitDate(dateInput)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <div className="date-display" title={prettyDate(sheet.displayDate) || undefined}>
          {prettyDate(sheet.displayDate) || <span style={{ opacity: 0.6 }}>Type a date</span>}
        </div>
        <button className="nav-btn ghost" onClick={goNext} disabled={sheetIdx <= 0} title={sheetIdx <= 0 ? 'No newer sheet' : 'Newer sheet'}>›</button>
      </div>
      <div className="todo-list">
        {sheet.todos.map((t, i) => (
          <div
            key={i}
            className={`todo-row ${dragOverIdx === i ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
            onDragLeave={() => setDragOverIdx(curr => curr === i ? null : curr)}
            onDrop={e => {
              e.preventDefault();
              const from = dragFromRef.current;
              setDragOverIdx(null);
              if (from === null || from === i) return;
              moveTodo(from, i);
              dragFromRef.current = null;
            }}
          >
            <span
              className="todo-handle"
              draggable
              onDragStart={e => {
                dragFromRef.current = i;
                e.dataTransfer.effectAllowed = 'move';
                // setData required by Firefox; harmless here
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragEnd={() => { dragFromRef.current = null; setDragOverIdx(null); }}
              title="Drag to reorder"
            >⋮⋮</span>
            <Checkbox
              item={t}
              mode={checkboxMode}
              onChange={item => updateTodo(i, item)}
              onOpenPalette={anchor => setPalette({ idx: i, anchor })}
            />
            <input
              className={`todo-text ${t.status === 'comment' ? 'comment' : ''} ${t.status === 'important' ? 'important' : ''} ${t.canceled ? 'canceled' : ''} ${t.status === 'done' ? 'done' : ''}`}
              type="text"
              value={t.text}
              onChange={e => updateTodo(i, { ...t, text: e.target.value })}
            />
          </div>
        ))}
      </div>
      {palette && (
        <StatusPalette
          item={sheet.todos[palette.idx]}
          anchor={palette.anchor}
          onChange={item => updateTodo(palette.idx, item)}
          onClose={() => setPalette(null)}
        />
      )}
    </div>
  );
};
