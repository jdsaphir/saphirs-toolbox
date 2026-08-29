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

const DEFAULT_POMODORO_WORK_MIN = 25;
const DEFAULT_POMODORO_BREAK_MIN = 5;
const MAX_MINUTES = 999;

function clampMinutes(value: number): number {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_MINUTES);
}

const workMinutes = (s: TimerState) => s.pomodoroWorkMin ?? DEFAULT_POMODORO_WORK_MIN;
const breakMinutes = (s: TimerState) => s.pomodoroBreakMin ?? DEFAULT_POMODORO_BREAK_MIN;

export const Timer: React.FC<Props> = ({ state, setState, onClose }) => {
  const [minInput, setMinInput] = useState(5);
  // Seeded from the live state so reopening the widget shows the durations
  // actually in force — the state outlives this component.
  const [workInput, setWorkInput] = useState(() => workMinutes(state));
  const [breakInput, setBreakInput] = useState(() => breakMinutes(state));

  function pomodoroState(phase: 'work' | 'break', work: number, brk: number): TimerState {
    return {
      mode: 'pomodoro',
      running: false,
      seconds: (phase === 'work' ? work : brk) * 60,
      pomodoroPhase: phase,
      pomodoroWorkMin: work,
      pomodoroBreakMin: brk,
    };
  }

  function setMode(mode: TimerState['mode']) {
    if (mode === 'stopwatch') setState({ mode, running: false, seconds: 0 });
    else if (mode === 'timer') setState({ mode, running: false, seconds: minInput * 60 });
    else setState(pomodoroState('work', workInput, breakInput));
  }

  function start() { setState(s => ({ ...s, running: true })); }
  function pause() { setState(s => ({ ...s, running: false })); }
  function reset() {
    if (state.mode === 'stopwatch') setState({ mode: 'stopwatch', running: false, seconds: 0 });
    else if (state.mode === 'timer') setState({ mode: 'timer', running: false, seconds: minInput * 60 });
    else setState(pomodoroState('work', workInput, breakInput));
  }

  function applyTimerSet() {
    if (state.mode === 'timer') setState({ mode: 'timer', running: false, seconds: minInput * 60 });
  }

  // Restarts the phase you're currently in at its new length.
  function applyPomodoroSet() {
    if (state.mode !== 'pomodoro') return;
    setState(s => pomodoroState(s.pomodoroPhase ?? 'work', workInput, breakInput));
  }

  return (
    <div className="widget timer-widget" onClick={e => e.stopPropagation()}>
      <div className="widget-header" data-drag-handle>
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
          <span className="timer-set-label">Minutes</span>
          <input
            type="number"
            min={1}
            max={MAX_MINUTES}
            value={minInput}
            onChange={e => setMinInput(clampMinutes(Number(e.target.value)))}
          />
          <button className="ghost" onClick={applyTimerSet}>Set</button>
        </div>
      )}
      {state.mode === 'pomodoro' && (
        <>
          <div className="timer-set-row">
            <span className="timer-set-label">Work</span>
            <input
              type="number"
              min={1}
              max={MAX_MINUTES}
              value={workInput}
              onChange={e => setWorkInput(clampMinutes(Number(e.target.value)))}
              title="Work phase length, in minutes"
            />
            <span className="timer-set-label">Break</span>
            <input
              type="number"
              min={1}
              max={MAX_MINUTES}
              value={breakInput}
              onChange={e => setBreakInput(clampMinutes(Number(e.target.value)))}
              title="Break phase length, in minutes"
            />
            <button className="ghost" onClick={applyPomodoroSet}>Set</button>
          </div>
          <div className="timer-phase-label">
            {state.pomodoroPhase === 'work' ? 'Work phase' : 'Break phase'}
            {' · '}{workMinutes(state)} / {breakMinutes(state)}
          </div>
        </>
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
          const nextMin = nextPhase === 'work' ? workMinutes(s) : breakMinutes(s);
          setState({ ...s, seconds: nextMin * 60, pomodoroPhase: nextPhase });
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
