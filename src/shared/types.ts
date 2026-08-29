// Shared types between main and renderer processes.

// Progress is mutually exclusive. Reserved 'backslash' is unused for now;
// kept so users can adopt it later without a data migration.
//   empty      — to do
//   in_progress — forward slash (/)
//   backslash   — backslash (\)   (reserved; meaning undefined)
//   done        — × (corner-to-corner cross)
export type ProgressState = 'empty' | 'in_progress' | 'backslash' | 'done';

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
export type WeekStart = 'sunday' | 'monday';

export interface Settings {
  shortcut: string;                        // Electron accelerator
  checkboxMode: CheckboxInteractionMode;
  dolphinIcon: DolphinIconVariant;
  dolphinX: number;
  dolphinY: number;
  toolboxSide: 'left' | 'right' | 'auto';  // direction the toolbar expands; auto = pick by dolphin x
  weekStart: WeekStart;                     // first day of the week shown in the calendar
  // Dolphin icon colors (hex). "eye" is the duotone secondary color; the
  // "Open" variants apply while the toolbox is open.
  dolphinColor: string;
  dolphinColorOpen: string;
  dolphinEyeColor: string;
  dolphinEyeColorOpen: string;
  accentColor: string;                      // app accent (drives --accent at runtime)
}

export interface TimerState {
  mode: 'stopwatch' | 'timer' | 'pomodoro';
  running: boolean;
  // remaining seconds for timer/pomodoro, elapsed for stopwatch
  seconds: number;
  // pomodoro: current phase
  pomodoroPhase?: 'work' | 'break';
  // pomodoro: phase lengths in minutes. Optional — omitted means the 25 / 5
  // defaults. They live on the state (not just in the widget) because the
  // headless ticker rolls phases over while the Timer widget is closed.
  pomodoroWorkMin?: number;
  pomodoroBreakMin?: number;
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
