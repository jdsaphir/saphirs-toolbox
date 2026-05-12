# Saphir's Toolbox

A floating utility companion for Windows. A small dolphin button hovers over every window; click it (or press a global shortcut) to expand a compact widget toolbox: a daily to-do sheet, a scratchpad, and an extensible toolbar of mini-tools (calculator, timer, settings).

## Features

- **Floating dolphin** — always-on-top, draggable, persists its position.
- **Global shortcut** — default `Ctrl+Alt+Space`. Configurable in settings.
- **Toolbox overlay** — transparent screen overlay; widgets cluster near the dolphin and the toolbar grows in the direction of more screen space.
- **To-do sheets** — 18 rows per sheet, with rich checkbox states (in progress, done, meeting, deferred, delegated, important, comment, optional, personal, follow-up, canceled, and reserved states for future use). Drag rows to reorder.
- **Date header** — type any date in the title (e.g. `5/12/2026`) and it displays as "Tuesday, May 12th, 2026 (Week 20)".
- **Sheet history** — unlimited sheets, navigated with `‹ ›` or the sheets dropdown.
- **Scratchpad** — always visible alongside the to-do list. Open and save `.md` files.
- **Calculator** — basic arithmetic with keyboard support.
- **Timer / Stopwatch / Pomodoro** — runs in the background; remaining time appears as a pill above the dolphin icon.
- **Settings** — rebind the global shortcut by pressing keys; switch checkbox interaction mode (popup palette vs. left-click cycle); pick dolphin icon style; control toolbar expansion direction.

## Checkbox states

| Glyph | Meaning |
| --- | --- |
| (empty) | To do |
| `/` | In progress |
| `✓` | Done |
| `—` | Meeting / call |
| `›` | Deferred |
| `‹` | Delegated |
| `\|` | Important (text rendered in gold) |
| `//` | Comment (text rendered gray, italic) |
| `^` `v` `○` | Reserved (no meaning yet) |

Corner notches combine with any status:

- **Top-left**: Optional
- **Top-right**: Personal
- **Bottom-right**: Follow up
- **Bottom-left**: Canceled

## Development

```sh
npm install
npm run dev     # vite + electron with hot reload
npm start       # production-style: compile, then run
npm run build   # produce installer in dist/
```

Data lives in SQLite at `%APPDATA%/saphirs-toolbox/toolbox.db`.

## Stack

- Electron 33 (main + preload + two renderer windows: dolphin and overlay)
- Vite + React + TypeScript
- `better-sqlite3` for persistence
