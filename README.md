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
- **Calendar** — month grid with ISO week numbers; click a date to open its task list (or create one on the spot). Dates that already have a list are marked with a dot, and a "Today" button jumps back to the current month. Week start (Sunday/Monday) is configurable in settings.
- **Timer / Stopwatch / Pomodoro** — runs in the background; remaining time appears as a pill above the dolphin icon. Timer length, and the Pomodoro work and break lengths, are set per session in the widget (Pomodoro defaults to 25 / 5).
- **Settings** — rebind the global shortcut by pressing keys; switch checkbox interaction mode (popup palette vs. left-click cycle); pick dolphin icon style and customize its colors (body/eye, plus the colors shown while the toolbox is open); set the app accent color; control toolbar expansion direction; choose whether the calendar week starts on Sunday or Monday.

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

## Install

Pre-built Windows binaries are attached to each [GitHub Release](https://github.com/jdsaphir/saphirs-toolbox/releases):

- **Setup (`SaphirsToolbox-<version>-setup.exe`)** — installs the app, registers it in Add/Remove Programs, and auto-updates in place when new versions are released.
- **Portable (`SaphirsToolbox-<version>-portable.exe`)** — single self-contained executable. Drop it anywhere and double-click. No installation, no Add/Remove Programs entry. Update by downloading a new release.

The app lives in the system tray. Right-click the tray icon for Open / Hide / Settings / Quit, or click the dolphin to toggle the toolbox. There is also a Quit button at the bottom of the Settings panel.

Data lives in SQLite at `%APPDATA%/saphirs-toolbox/toolbox.db`.

## Run & build

```sh
npm install
npm run dev     # vite + electron with hot reload
npm start       # compile, then run electron
npm run icon    # regenerate assets/icon.ico and assets/tray.png from the SVG
npm run build   # produce dist/SaphirsToolbox-<version>-{portable,setup}.exe (no publish)
npm run release # same, but publish to GitHub Releases (requires GH_TOKEN)
```

## Releasing

Tagged commits matching `v*.*.*` are built by `.github/workflows/release.yml` on a Windows runner and published to GitHub Releases as a draft. To cut a release:

```sh
# 1. Bump `version` in package.json and commit
npm version 1.0.1            # also creates the v1.0.1 tag locally
git push && git push --tags
# 2. Wait for the Release workflow to finish (Actions tab)
# 3. On GitHub, review the draft release, edit notes, click Publish
```

Installed (NSIS) builds check for updates on launch via `electron-updater`. Portable builds don't auto-update — users grab a new file from the Releases page.

## Stack

- Electron 33 (main + preload + two renderer windows: dolphin and overlay)
- Vite + React + TypeScript
- `better-sqlite3` for persistence
- `@resvg/resvg-js` + `to-ico` to rasterize the dolphin SVG into a multi-resolution `.ico`

## Roadmap / not yet built

- More tools: unit converter, color picker, clipboard history, regex tester, JSON formatter, world clock.
