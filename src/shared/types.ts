// Shared types between main and renderer processes.

export type CheckboxStatus =
  | 'empty'
  | 'in_progress'
  | 'done'
  | 'meeting'
  | 'deferred'
  | 'delegated'
  | 'important'
  | 'comment'
  | 'chevron_up'
  | 'chevron_down'
  | 'circle';

export interface TodoItem {
  text: string;
  status: CheckboxStatus;
  personal: boolean;       // top-right notch
  followUp: boolean;       // bottom-right notch
  canceled: boolean;       // bottom-left notch
  optional: boolean;       // top-left notch
}

export interface Sheet {
  id: number;
  title: string;             // user-entered date string, e.g. "5/12/2026"
  displayDate: string | null; // ISO date if parseable, null otherwise
  todos: TodoItem[];          // exactly 18
  scratchpad: string;
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
}

export type CheckboxInteractionMode = 'palette' | 'cycle';
export type DolphinIconVariant = 'duotone' | 'solid';

export interface Settings {
  shortcut: string;                        // Electron accelerator
  checkboxMode: CheckboxInteractionMode;
  dolphinIcon: DolphinIconVariant;
  dolphinX: number;
  dolphinY: number;
  toolboxSide: 'left' | 'right' | 'auto';  // direction the toolbar expands; auto = pick by dolphin x
}

export interface TimerState {
  mode: 'stopwatch' | 'timer' | 'pomodoro';
  running: boolean;
  // remaining seconds for timer/pomodoro, elapsed for stopwatch
  seconds: number;
  // pomodoro: current phase
  pomodoroPhase?: 'work' | 'break';
}

export const EMPTY_TODO: TodoItem = {
  text: '',
  status: 'empty',
  personal: false,
  followUp: false,
  canceled: false,
  optional: false,
};

export const TODOS_PER_SHEET = 18;
