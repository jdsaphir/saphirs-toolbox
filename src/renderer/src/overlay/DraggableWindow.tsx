import React, { useEffect, useRef, useState } from 'react';

interface Props {
  initialLeft: number;
  initialTop: number;
  zIndex?: number;
  // Reset position when this key changes (e.g., when re-opening the same tool).
  resetKey?: string | number;
  children: React.ReactNode;
}

// Wraps a tool widget and makes it draggable by any descendant element with
// `data-drag-handle` (typically the widget header). The position is kept in
// local state; clamped to the viewport on each move.
export const DraggableWindow: React.FC<Props> = ({ initialLeft, initialTop, zIndex = 50, resetKey, children }) => {
  const [pos, setPos] = useState({ left: initialLeft, top: initialTop });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  // Re-anchor if a different tool is mounted via the same wrapper instance.
  useEffect(() => {
    setPos({ left: initialLeft, top: initialTop });
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
      const left = Math.max(0, Math.min(window.innerWidth - w, ev.clientX - dragRef.current.offsetX));
      const top = Math.max(0, Math.min(window.innerHeight - h, ev.clientY - dragRef.current.offsetY));
      setPos({ left, top });
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
