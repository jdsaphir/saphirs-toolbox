import React, { useMemo, useState } from 'react';
import type { WeekStart } from '../../../shared/types';
import type { SheetSummary } from './SheetsDropdown';
import { formatSheetTitle, isoWeek, isSameDay, parseIsoDate, toIsoDate } from '../shared/date-format';

interface Props {
  weekStart: WeekStart;
  sheets: SheetSummary[];
  activeDate: string | null;          // ISO date of the currently-open sheet, if any
  onPickDate: (iso: string) => void;  // open (or create) the sheet for this date
  onClose: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export const Calendar: React.FC<Props> = ({ weekStart, sheets, activeDate, onPickDate, onClose }) => {
  const today = useMemo(() => new Date(), []);
  // Open on the active sheet's month if it has a date, otherwise the current month.
  const initial = activeDate ? parseIsoDate(activeDate) : today;
  const [view, setView] = useState<{ year: number; month: number }>({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });

  // ISO dates that already have a task list.
  const datesWithSheet = useMemo(
    () => new Set(sheets.map(s => s.displayDate).filter((d): d is string => !!d)),
    [sheets]
  );

  // Build a fixed 6×7 grid so the widget height never jumps between months.
  const weeks = useMemo(() => {
    const firstOfMonth = new Date(view.year, view.month, 1);
    const startOffset = weekStart === 'sunday'
      ? firstOfMonth.getDay()
      : (firstOfMonth.getDay() + 6) % 7;
    const gridStart = addDays(firstOfMonth, -startOffset);
    const rows: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) row.push(addDays(gridStart, w * 7 + d));
      rows.push(row);
    }
    return rows;
  }, [view, weekStart]);

  const weekdayLabels = weekStart === 'sunday'
    ? WEEKDAY_LABELS
    : [...WEEKDAY_LABELS.slice(1), WEEKDAY_LABELS[0]];

  // The ISO week number is anchored on the Monday of the row regardless of the
  // chosen display start (Mon..Sun all share one ISO week; Sunday belongs to the
  // previous one), so use the Monday cell explicitly.
  function rowWeekNumber(row: Date[]): number {
    const monday = weekStart === 'sunday' ? row[1] : row[0];
    return isoWeek(monday);
  }

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  }
  function goToday() {
    setView({ year: today.getFullYear(), month: today.getMonth() });
  }

  return (
    <div className="widget cal-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header" data-drag-handle>
        <span className="title">Calendar</span>
        <div className="actions">
          <button className="ghost icon" onClick={goToday} title="Jump to today">Today</button>
          <button className="ghost icon" onClick={onClose} title="Close">×</button>
        </div>
      </div>

      <div className="cal-nav">
        <button className="ghost icon" onClick={prevMonth} title="Previous month">‹</button>
        <span className="cal-month">{MONTHS[view.month]} {view.year}</span>
        <button className="ghost icon" onClick={nextMonth} title="Next month">›</button>
      </div>

      <div className="cal-grid">
        <div className="cal-head cal-weeknum" title="ISO week">#</div>
        {weekdayLabels.map(l => (
          <div key={l} className="cal-head">{l}</div>
        ))}

        {weeks.map((row, wi) => (
          <React.Fragment key={wi}>
            <div className="cal-weeknum" title="ISO week">{rowWeekNumber(row)}</div>
            {row.map(cell => {
              const iso = toIsoDate(cell);
              const outside = cell.getMonth() !== view.month;
              const classes = ['cal-day'];
              if (outside) classes.push('outside');
              if (isSameDay(cell, today)) classes.push('today');
              if (datesWithSheet.has(iso)) classes.push('has-sheet');
              if (activeDate && iso === activeDate) classes.push('selected');
              const title = datesWithSheet.has(iso)
                ? 'Open task list'
                : `Create task list for ${formatSheetTitle(cell)}`;
              return (
                <button
                  key={iso}
                  className={classes.join(' ')}
                  onClick={() => onPickDate(iso)}
                  title={title}
                >
                  {cell.getDate()}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
