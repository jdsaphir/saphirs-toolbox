import React, { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import { formatTimer } from '../shared/timer-format';
import type { TimerState } from '../../../shared/types';

// Timer state is owned here and broadcast (via main) to the dolphin pill.
// The overlay's parent persists the same state in a ref so the timer survives
// open/close of the overlay.

interface Props {
  state: TimerState;
  setState: React.Dispatch<React.SetStateAction<TimerState>>;
  onClose: () => void;
}

const POMODORO_WORK = 25 * 60;
const POMODORO_BREAK = 5 * 60;

export const Timer: React.FC<Props> = ({ state, setState, onClose }) => {
  const [minInput, setMinInput] = useState(5);

  function setMode(mode: TimerState['mode']) {
    if (mode === 'stopwatch') setState({ mode, running: false, seconds: 0 });
    else if (mode === 'timer') setState({ mode, running: false, seconds: minInput * 60 });
    else setState({ mode, running: false, seconds: POMODORO_WORK, pomodoroPhase: 'work' });
  }

  function start() { setState(s => ({ ...s, running: true })); }
  function pause() { setState(s => ({ ...s, running: false })); }
  function reset() {
    if (state.mode === 'stopwatch') setState({ mode: 'stopwatch', running: false, seconds: 0 });
    else if (state.mode === 'timer') setState({ mode: 'timer', running: false, seconds: minInput * 60 });
    else setState({ mode: 'pomodoro', running: false, seconds: POMODORO_WORK, pomodoroPhase: 'work' });
  }

  function applyTimerSet() {
    if (state.mode === 'timer') setState({ mode: 'timer', running: false, seconds: minInput * 60 });
  }

  return (
    <div className="widget timer-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header">
        <span className="title">Timer</span>
        <div className="actions"><button className="ghost icon" onClick={onClose} title="Close">×</button></div>
      </div>
      <div className="timer-mode-row">
        <button className={state.mode === 'stopwatch' ? 'active' : ''} onClick={() => setMode('stopwatch')}>Stopwatch</button>
        <button className={state.mode === 'timer' ? 'active' : ''} onClick={() => setMode('timer')}>Timer</button>
        <button className={state.mode === 'pomodoro' ? 'active' : ''} onClick={() => setMode('pomodoro')}>Pomodoro</button>
      </div>
      {state.mode === 'timer' && (
        <div className="timer-set-row">
          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Minutes:</span>
          <input type="number" min={1} value={minInput} onChange={e => setMinInput(Math.max(1, Number(e.target.value) || 1))} />
          <button className="ghost" onClick={applyTimerSet}>Set</button>
        </div>
      )}
      {state.mode === 'pomodoro' && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
          {state.pomodoroPhase === 'work' ? 'Work phase' : 'Break phase'} · 25 / 5
        </div>
      )}
      <div className="timer-display">{formatTimer(state.seconds)}</div>
      <div className="timer-controls">
        {state.running
          ? <button onClick={pause}>Pause</button>
          : <button className="primary" onClick={start}>Start</button>}
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  );
};

// Headless ticker — runs in OverlayApp at all times (even when Timer widget is closed).
export function useTimerTicker(state: TimerState, setState: React.Dispatch<React.SetStateAction<TimerState>>) {
  const intervalRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    function tick() {
      const s = stateRef.current;
      if (!s.running) return;
      if (s.mode === 'stopwatch') {
        setState({ ...s, seconds: s.seconds + 1 });
      } else if (s.mode === 'timer') {
        if (s.seconds <= 1) {
          setState({ ...s, seconds: 0, running: false });
          // simple feedback
          try { new Audio().play(); } catch { /* ignore */ }
        } else {
          setState({ ...s, seconds: s.seconds - 1 });
        }
      } else if (s.mode === 'pomodoro') {
        if (s.seconds <= 1) {
          const nextPhase = s.pomodoroPhase === 'work' ? 'break' : 'work';
          const nextSecs = nextPhase === 'work' ? POMODORO_WORK : POMODORO_BREAK;
          setState({ ...s, seconds: nextSecs, pomodoroPhase: nextPhase });
        } else {
          setState({ ...s, seconds: s.seconds - 1 });
        }
      }
    }
    intervalRef.current = window.setInterval(tick, 1000);
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [setState]);

  // Broadcast to dolphin pill whenever state changes
  useEffect(() => {
    // Hide pill when at "idle stopwatch zero" — only show if it's been running or is set
    const visible =
      state.running ||
      (state.mode === 'stopwatch' && state.seconds > 0) ||
      (state.mode === 'timer' && state.seconds > 0) ||
      (state.mode === 'pomodoro');
    api.broadcastTimer(visible ? state : null);
  }, [state]);
}
