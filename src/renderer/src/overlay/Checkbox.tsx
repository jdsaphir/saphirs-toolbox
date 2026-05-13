import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProgressState, TodoItem } from '../../../shared/types';
import { GLYPH_KEYS, GLYPH_LABEL, GlyphKey, renderGlyph } from './CheckboxGlyphs';

// Maps a TodoItem to the set of glyphs that should be drawn inside its box.
function todoGlyphs(t: TodoItem): GlyphKey[] {
  const out: GlyphKey[] = [];
  if (t.progress === 'in_progress') out.push('in_progress');
  if (t.progress === 'backslash') out.push('backslash');
  if (t.progress === 'done') out.push('done');
  if (t.meeting) out.push('meeting');
  if (t.deferred) out.push('deferred');
  if (t.delegated) out.push('delegated');
  if (t.important) out.push('important');
  if (t.comment) out.push('comment');
  if (t.chevronUp) out.push('chevron_up');
  if (t.chevronDown) out.push('chevron_down');
  if (t.circle) out.push('circle');
  return out;
}

// Cycle order for the click-to-cycle interaction mode. Skips 'backslash'
// since it's reserved for explicit user choice via the palette.
const CYCLE: ProgressState[] = ['empty', 'in_progress', 'done'];

export const Checkbox: React.FC<{
  item: TodoItem;
  mode: 'palette' | 'cycle';
  onChange: (item: TodoItem) => void;
  onOpenPalette: (anchor: HTMLElement) => void;
}> = ({ item, mode, onChange, onOpenPalette }) => {
  const ref = useRef<HTMLDivElement>(null);
  const glyphs = todoGlyphs(item);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (mode === 'palette') {
      if (ref.current) onOpenPalette(ref.current);
    } else {
      const idx = CYCLE.indexOf(item.progress);
      const next = CYCLE[(idx + 1) % CYCLE.length] ?? 'empty';
      onChange({ ...item, progress: next });
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (ref.current) onOpenPalette(ref.current);
  }

  const titleParts: string[] = [];
  if (item.progress === 'empty' && glyphs.length === 0) titleParts.push('To do');
  if (item.progress === 'in_progress') titleParts.push('In progress');
  if (item.progress === 'backslash') titleParts.push('Backslash (reserved)');
  if (item.progress === 'done') titleParts.push('Done');
  if (item.meeting) titleParts.push('Meeting');
  if (item.deferred) titleParts.push('Deferred');
  if (item.delegated) titleParts.push('Delegated');
  if (item.important) titleParts.push('Important');
  if (item.comment) titleParts.push('Comment');
  if (item.chevronUp) titleParts.push('Chevron up');
  if (item.chevronDown) titleParts.push('Chevron down');
  if (item.circle) titleParts.push('Circle');

  // Border/color cue: prefer "done" green if done; in-progress blue if in progress;
  // important amber otherwise; fall back to the dim default.
  let stateClass = '';
  if (item.progress === 'done') stateClass = 'done';
  else if (item.progress === 'in_progress') stateClass = 'in_progress';
  else if (item.progress === 'backslash') stateClass = 'backslash';
  else if (item.important) stateClass = 'important';
  else if (item.comment) stateClass = 'comment';

  return (
    <div
      ref={ref}
      className={`checkbox ${stateClass}`}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      title={titleParts.join(' · ')}
    >
      <svg viewBox="0 0 18 18" width="100%" height="100%">
        {glyphs.map(k => (
          <React.Fragment key={k}>{renderGlyph(k)}</React.Fragment>
        ))}
      </svg>
      {item.optional && <span className="notch tl" />}
      {item.personal && <span className="notch tr" />}
      {item.followUp && <span className="notch br" />}
      {item.canceled && <span className="notch bl" />}
    </div>
  );
};

// ── Palette ─────────────────────────────────────────────────────────────────

export const StatusPalette: React.FC<{
  item: TodoItem;
  anchor: HTMLElement;
  onChange: (item: TodoItem) => void;
  onClose: () => void;
}> = ({ item, anchor, onChange, onClose }) => {
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

  function setProgress(p: ProgressState) {
    onChange({ ...item, progress: p });
  }
  function toggleFlag(key: keyof TodoItem) {
    onChange({ ...item, [key]: !item[key] } as TodoItem);
  }

  // Combinable flag definitions for the palette (excluding the mutually-exclusive
  // progress states which get their own row).
  const FLAG_DEFS: Array<{ key: keyof TodoItem; glyph: GlyphKey; color?: string }> = [
    { key: 'meeting', glyph: 'meeting' },
    { key: 'deferred', glyph: 'deferred' },
    { key: 'delegated', glyph: 'delegated' },
    { key: 'important', glyph: 'important', color: 'var(--important)' },
    { key: 'comment', glyph: 'comment', color: 'var(--text-dim)' },
    { key: 'chevronUp', glyph: 'chevron_up' },
    { key: 'chevronDown', glyph: 'chevron_down' },
    { key: 'circle', glyph: 'circle' },
  ];

  return createPortal(
    <div
      ref={paletteRef}
      className="palette"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="palette-section">
        <div className="label">Progress</div>
        <div className="palette-row">
          <PaletteCell active={item.progress === 'empty'} onClick={() => setProgress('empty')} title="To do" />
          <PaletteCell active={item.progress === 'in_progress'} onClick={() => setProgress('in_progress')} title="In progress" glyphs={['in_progress']} color="var(--accent)" />
          <PaletteCell active={item.progress === 'backslash'} onClick={() => setProgress('backslash')} title="Backslash (reserved)" glyphs={['backslash']} color="var(--danger)" />
          <PaletteCell active={item.progress === 'done'} onClick={() => setProgress('done')} title="Done" glyphs={['done']} color="var(--success)" />
        </div>
      </div>
      <div className="palette-section">
        <div className="label">Flags (combine freely)</div>
        <div className="palette-row palette-row-wide">
          {FLAG_DEFS.map(d => (
            <PaletteCell
              key={d.key}
              active={Boolean(item[d.key])}
              onClick={() => toggleFlag(d.key)}
              title={GLYPH_LABEL[d.glyph]}
              glyphs={[d.glyph]}
              color={d.color}
            />
          ))}
        </div>
      </div>
      <div className="palette-section">
        <div className="label">Notches</div>
        <div className="palette-toggle-row">
          <div className={`palette-toggle optional ${item.optional ? 'active' : ''}`} onClick={() => toggleFlag('optional')} title="Top-left: Optional"><span style={{ color: 'var(--success)' }}>◤</span> Optional</div>
          <div className={`palette-toggle personal ${item.personal ? 'active' : ''}`} onClick={() => toggleFlag('personal')} title="Top-right: Personal"><span style={{ color: 'var(--accent)' }}>◥</span> Personal</div>
          <div className={`palette-toggle canceled ${item.canceled ? 'active' : ''}`} onClick={() => toggleFlag('canceled')} title="Bottom-left: Canceled"><span style={{ color: 'var(--text-dim)' }}>◣</span> Canceled</div>
          <div className={`palette-toggle followUp ${item.followUp ? 'active' : ''}`} onClick={() => toggleFlag('followUp')} title="Bottom-right: Follow up"><span style={{ color: 'var(--danger)' }}>◢</span> Follow up</div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const PaletteCell: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  glyphs?: GlyphKey[];
  color?: string;
}> = ({ active, onClick, title, glyphs, color }) => (
  <div className={`palette-cell ${active ? 'active' : ''}`} title={title} onClick={onClick}>
    <div className="checkbox" style={{ width: 26, height: 26, color }}>
      {glyphs && glyphs.length > 0 && (
        <svg viewBox="0 0 18 18" width="100%" height="100%">
          {glyphs.map(g => (
            <React.Fragment key={g}>{renderGlyph(g)}</React.Fragment>
          ))}
        </svg>
      )}
    </div>
  </div>
);

// Re-exports kept for any older imports.
export { GLYPH_KEYS, GLYPH_LABEL };
