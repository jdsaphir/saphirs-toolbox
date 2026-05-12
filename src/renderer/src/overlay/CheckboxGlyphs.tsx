import React from 'react';

// SVG glyphs that compose inside a 16-unit-wide viewBox. Each one is a stroke
// (no fill) drawn corner-to-corner or edge-to-edge so multiple statuses can be
// layered cleanly inside the same checkbox.
//
// The checkbox renders these into an <svg viewBox="0 0 16 16"> sized to fill
// the box's content area. Stroke color comes from CSS via `currentColor`.

const COMMON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const GLYPH_KEYS = [
  'in_progress',
  'done',
  'meeting',
  'deferred',
  'delegated',
  'important',
  'comment',
  'chevron_up',
  'chevron_down',
  'circle',
] as const;
export type GlyphKey = (typeof GLYPH_KEYS)[number];

export const GLYPH_LABEL: Record<GlyphKey, string> = {
  in_progress: 'In progress',
  done: 'Done',
  meeting: 'Meeting / call',
  deferred: 'Deferred',
  delegated: 'Delegated',
  important: 'Important',
  comment: 'Comment',
  chevron_up: 'Chevron up',
  chevron_down: 'Chevron down',
  circle: 'Circle',
};

// Bounded to the 16x16 viewBox with ~1.5 unit padding so strokes don't kiss the
// border. Each glyph occupies the full inner area for clarity at 16-22px sizes.
export function renderGlyph(key: GlyphKey): React.ReactNode {
  switch (key) {
    case 'in_progress':
      // bottom-left to top-right diagonal
      return <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" {...COMMON_PROPS} />;
    case 'done':
      // tick
      return <polyline points="2.5,8.5 6.5,12.5 13.5,3.5" {...COMMON_PROPS} />;
    case 'meeting':
      // horizontal bar through middle, edge to edge
      return <line x1="2.5" y1="8" x2="13.5" y2="8" {...COMMON_PROPS} />;
    case 'deferred':
      // right-pointing chevron, top-left → mid-right → bottom-left
      return <polyline points="3.5,2.5 11.5,8 3.5,13.5" {...COMMON_PROPS} />;
    case 'delegated':
      // left-pointing chevron, top-right → mid-left → bottom-right
      return <polyline points="12.5,2.5 4.5,8 12.5,13.5" {...COMMON_PROPS} />;
    case 'important':
      // vertical bar through middle, edge to edge
      return <line x1="8" y1="2.5" x2="8" y2="13.5" {...COMMON_PROPS} />;
    case 'comment':
      // two parallel slashes
      return (
        <>
          <line x1="3" y1="12.5" x2="7.5" y2="3.5" {...COMMON_PROPS} />
          <line x1="8.5" y1="12.5" x2="13" y2="3.5" {...COMMON_PROPS} />
        </>
      );
    case 'chevron_up':
      // ^ pointing up
      return <polyline points="3,11 8,4 13,11" {...COMMON_PROPS} />;
    case 'chevron_down':
      // v pointing down
      return <polyline points="3,5 8,12 13,5" {...COMMON_PROPS} />;
    case 'circle':
      return <circle cx="8" cy="8" r="4.5" {...COMMON_PROPS} />;
  }
}

// A standalone preview chip for the palette: just the box + this glyph.
export const GlyphPreview: React.FC<{ keys: GlyphKey[]; size?: number; className?: string }> = ({ keys, size = 22, className }) => (
  <div
    className={`checkbox ${className ?? ''}`}
    style={{ width: size, height: size, padding: 0 }}
  >
    <svg viewBox="0 0 16 16" width="100%" height="100%">
      {keys.map(k => (
        <React.Fragment key={k}>{renderGlyph(k)}</React.Fragment>
      ))}
    </svg>
  </div>
);
