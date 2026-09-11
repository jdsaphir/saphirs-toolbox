import React, { useLayoutEffect, useRef, useState } from 'react';

interface Props {
  initialLeft: number;
  initialTop: number;
  zIndex?: number;
  // Reset position when this key changes (e.g., when re-opening the same tool).
  resetKey?: string | number;
  children: React.ReactNode;
}

// Breathing room kept from the screen edges when a window first opens
// (matches the overlay layout's padding).
const OPEN_MARGIN = 16;

// Pull a window of size w×h back inside the viewport, `margin` px from the
// edges. A window larger than the viewport is pinned to the top-left.
function clampToViewport(left: number, top: number, w: number, h: number, margin: number) {
  return {
    left: Math.max(margin, Math.min(window.innerWidth - w - margin, left)),
    top: Math.max(margin, Math.min(window.innerHeight - h - margin, top)),
  };
}

// Wraps a tool widget and makes it draggable by any descendant element with
// `data-drag-handle` (typically the widget header). The position is kept in
// local state and always clamped to the viewport: on open, on each move, and
// whenever the window's size changes.
export const DraggableWindow: React.FC<Props> = ({ initialLeft, initialTop, zIndex = 50, resetKey, children }) => {
  const [pos, setPos] = useState({ left: initialLeft, top: initialTop });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  // (Re-)anchor when a tool is mounted. The initial position is only a hint:
  // tools differ in size, so it's clamped once the new tool is measured.
  // Runs before paint, so the window never shows up off screen. Later size
  // changes (e.g. settings fields appearing) nudge it back in if needed.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setPos(clampToViewport(initialLeft, initialTop, el.offsetWidth, el.offsetHeight, OPEN_MARGIN));
    const ro = new ResizeObserver(() => {
      setPos(p => {
        const c = clampToViewport(p.left, p.top, el.offsetWidth, el.offsetHeight, 0);
        return c.left === p.left && c.top === p.top ? p : c;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [resetKey]);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Only drag when the mousedown originated from a drag handle (or its descendant).
    if (!target.closest('[data-drag-handle]')) return;
    // Don't drag when clicking an actual interactive element inside the handle.
    if (target.closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = wrapperRef.current!.getBoundingClientRect();
    dragRef.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current || !wrapperRef.current) return;
      const w = wrapperRef.current.offsetWidth;
      const h = wrapperRef.current.offsetHeight;
      setPos(clampToViewport(ev.clientX - dragRef.current.offsetX, ev.clientY - dragRef.current.offsetY, w, h, 0));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'absolute', left: pos.left, top: pos.top, zIndex }}
      onMouseDown={onMouseDown}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  );
};
