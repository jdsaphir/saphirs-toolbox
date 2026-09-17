import type { TimerState } from './types';

export const DEFAULT_TIMER_MIN = 5;
export const DEFAULT_POMODORO_WORK_MIN = 25;
export const DEFAULT_POMODORO_BREAK_MIN = 5;
export const MAX_MINUTES = 999;

export function clampMinutes(value: number): number {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_MINUTES);
}

// The lengths set for each mode. Every new state carries them over, so a mode
// you switch back to (or a clear) doesn't reset them to the defaults.
export function keepLengths(s: TimerState): Pick<TimerState, 'timerMinutes' | 'pomodoroWorkMin' | 'pomodoroBreakMin'> {
  return {
    ...(s.timerMinutes !== undefined ? { timerMinutes: s.timerMinutes } : {}),
    ...(s.pomodoroWorkMin !== undefined ? { pomodoroWorkMin: s.pomodoroWorkMin } : {}),
    ...(s.pomodoroBreakMin !== undefined ? { pomodoroBreakMin: s.pomodoroBreakMin } : {}),
  };
}

export const timerMinutes = (s: TimerState) => s.timerMinutes ?? DEFAULT_TIMER_MIN;
export const workMinutes = (s: TimerState) => s.pomodoroWorkMin ?? DEFAULT_POMODORO_WORK_MIN;
export const breakMinutes = (s: TimerState) => s.pomodoroBreakMin ?? DEFAULT_POMODORO_BREAK_MIN;

// What an agent can ask the timer to do (the control_timer command).
//   start  — (re)start from the beginning, optionally switching mode or lengths
//   pause  — stop counting, keep the time
//   resume — continue a paused timer
//   reset  — back to the beginning, not running
//   clear  — stop and hide the pill above the dolphin
export interface TimerAction {
  action: 'start' | 'pause' | 'resume' | 'reset' | 'clear';
  mode?: TimerState['mode'];
  minutes?: number;       // timer length
  workMinutes?: number;   // pomodoro work phase
  breakMinutes?: number;  // pomodoro break phase
}

// The state a mode starts in. Lengths not given in the action fall back to
// the ones already in force, then to the defaults.
function initialState(s: TimerState, a: TimerAction, mode: TimerState['mode']): TimerState {
  const kept = keepLengths(s);
  if (mode === 'stopwatch') return { ...kept, mode, running: false, seconds: 0 };
  if (mode === 'timer') {
    const min = clampMinutes(a.minutes ?? timerMinutes(s));
    return { ...kept, mode, running: false, seconds: min * 60, timerMinutes: min };
  }
  const work = clampMinutes(a.workMinutes ?? workMinutes(s));
  const brk = clampMinutes(a.breakMinutes ?? breakMinutes(s));
  return { ...kept, mode, running: false, seconds: work * 60, pomodoroPhase: 'work', pomodoroWorkMin: work, pomodoroBreakMin: brk };
}

// Pure transition; throws an Error with a user-facing message when the action
// can't apply to the current state.
export function applyTimerAction(s: TimerState, a: TimerAction): TimerState {
  switch (a.action) {
    case 'start':
      return { ...initialState(s, a, a.mode ?? s.mode), running: true };
    case 'reset':
      return initialState(s, a, a.mode ?? s.mode);
    case 'pause':
      return { ...s, running: false };
    case 'resume':
      if (s.mode === 'timer' && s.seconds <= 0) throw new Error('The timer has finished. Use "start" to run it again.');
      return { ...s, running: true };
    case 'clear':
      return { ...keepLengths(s), mode: 'stopwatch', running: false, seconds: 0 };
    default:
      throw new Error(`Unknown timer action "${(a as TimerAction).action}".`);
  }
}
