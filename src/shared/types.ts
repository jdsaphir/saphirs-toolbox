// Shared types between main and renderer processes.

// Progress is mutually exclusive: a task is either to-do (empty),
// in progress (forward slash), or done (check mark).
export type ProgressState = 'empty' | 'in_progress' | 'done';

// Type flags layer freely on top of progress. A meeting can be in progress;
// an important task can also be deferred; etc. The renderer draws each active
// flag as an SVG stroke inside the box.
export interface TodoItem {
  text: string;
  progress: ProgressState;
  // Combinable type flags
  meeting: boolean;
  deferred: boolean;
  delegated: boolean;
  important: boolean;
  comment: boolean;
  chevronUp: boolean;
  chevronDown: boolean;
  circle: boolean;
  // Corner notches
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
  progress: 'empty',
  meeting: false,
  deferred: false,
  delegated: false,
  important: false,
  comment: false,
  chevronUp: false,
  chevronDown: false,
  circle: false,
  personal: false,
  followUp: false,
  canceled: false,
  optional: false,
};

export const TODOS_PER_SHEET = 18;
