import React from 'react';

// SVG glyphs that compose inside an 18-unit viewBox (matching the checkbox's
// 18px outer size). Each one is a stroke (no fill) drawn corner-to-corner or
// edge-to-edge so multiple statuses can layer cleanly inside the same box.
//
// Coordinates run 1..17 so that with stroke-width 2 the round line cap sits
// flush with the inner edge of the box border — strokes visibly touch the
// edges without being clipped.

const COMMON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const GLYPH_KEYS = [
  'in_progress',
  'backslash',
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
  backslash: 'Reserved (\\)',
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

export function renderGlyph(key: GlyphKey): React.ReactNode {
  switch (key) {
    case 'in_progress':
      // bottom-left corner → top-right corner
      return <line x1="1" y1="17" x2="17" y2="1" {...COMMON_PROPS} />;
    case 'backslash':
      // top-left corner → bottom-right corner
      return <line x1="1" y1="1" x2="17" y2="17" {...COMMON_PROPS} />;
    case 'done':
      // × — both diagonals
      return (
        <>
          <line x1="1" y1="1" x2="17" y2="17" {...COMMON_PROPS} />
          <line x1="17" y1="1" x2="1" y2="17" {...COMMON_PROPS} />
        </>
      );
    case 'meeting':
      // horizontal bar through middle, full width
      return <line x1="1" y1="9" x2="17" y2="9" {...COMMON_PROPS} />;
    case 'deferred':
      // > — apex at right-edge middle; tails at top-left & bottom-left corners
      return <polyline points="1,1 17,9 1,17" {...COMMON_PROPS} />;
    case 'delegated':
      // < — apex at left-edge middle; tails at top-right & bottom-right corners
      return <polyline points="17,1 1,9 17,17" {...COMMON_PROPS} />;
    case 'important':
      // vertical bar through middle, full height
      return <line x1="9" y1="1" x2="9" y2="17" {...COMMON_PROPS} />;
    case 'comment':
      // two parallel slashes spanning most of the box
      return (
        <>
          <line x1="2" y1="16" x2="8" y2="2" {...COMMON_PROPS} />
          <line x1="10" y1="16" x2="16" y2="2" {...COMMON_PROPS} />
        </>
      );
    case 'chevron_up':
      // ^ — apex at top-edge middle; tails at bottom-left & bottom-right corners
      return <polyline points="1,17 9,1 17,17" {...COMMON_PROPS} />;
    case 'chevron_down':
      // v — apex at bottom-edge middle; tails at top-left & top-right corners
      return <polyline points="1,1 9,17 17,1" {...COMMON_PROPS} />;
    case 'circle':
      // centered circle filling the box
      return <circle cx="9" cy="9" r="7" {...COMMON_PROPS} />;
  }
}
