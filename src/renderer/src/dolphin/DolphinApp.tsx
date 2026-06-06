import React, { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import { DolphinIcon } from '../shared/DolphinIcon';
import { formatTimer } from '../shared/timer-format';
import type { Settings, TimerState } from '../../../shared/types';

const CLICK_THRESHOLD_PX = 4;

export const DolphinApp: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<TimerState | null>(null);

  const dragStateRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const apply = (s: Settings) => {
      setSettings(s);
      document.documentElement.style.setProperty('--accent', s.accentColor);
    };
    api.getSettings().then(apply);
    const offSettings = api.onSettingsChanged(apply);
    const offTb = api.onToolboxState(state => setOpen(state.open));
    const offTimer = api.onTimerTick(state => setTimer(state));
    return () => {
      offSettings();
      offTb();
      offTimer();
    };
  }, []);

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    dragStateRef.current = { startX: e.screenX, startY: e.screenY, moved: false };
    api.dolphinMoveStart({ x: e.clientX, y: e.clientY });

    const onMove = (ev: MouseEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      const dx = ev.screenX - s.startX;
      const dy = ev.screenY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) s.moved = true;
      if (s.moved) api.dolphinMove();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const s = dragStateRef.current;
      dragStateRef.current = null;
      api.dolphinMoveEnd();
      if (s && !s.moved) {
        // Treat as click → toggle toolbox
        api.toggleToolbox();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handlePillClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Ask the overlay to open AND switch to the timer tool.
    api.requestOpenTool('timer');
  }

  const pillClass = (() => {
    if (!timer) return '';
    if (!timer.running) return 'paused';
    if (timer.mode === 'pomodoro' && timer.pomodoroPhase === 'break') return 'break';
    return 'running';
  })();

  const variant = settings?.dolphinIcon ?? 'duotone';
  const bodyColor = open
    ? (settings?.dolphinColorOpen ?? '#6ee7a0')
    : (settings?.dolphinColor ?? '#5fb4ff');
  const eyeColor = open
    ? (settings?.dolphinEyeColorOpen ?? '#ffffff')
    : (settings?.dolphinEyeColor ?? '#ffffff');

  return (
    <div className="dolphin-root">
      {timer && (
        <div className={`timer-pill ${pillClass}`} onClick={handlePillClick} title="Open timer">
          {formatTimer(timer.seconds)}
        </div>
      )}
      <div className={`dolphin-button ${open ? 'open' : ''}`} onMouseDown={handleMouseDown} title="Saphir's Toolbox">
        <DolphinIcon variant={variant} color={bodyColor} eyeColor={eyeColor} />
      </div>
    </div>
  );
};
