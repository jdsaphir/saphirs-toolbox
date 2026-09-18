# Saphir's Toolbox

A floating utility companion for Windows. A small dolphin button hovers over every window; click it (or press a global shortcut) to expand a compact widget toolbox: a daily to-do sheet, a scratchpad, and an extensible toolbar of mini-tools (calculator, timer, settings).

## Features

- **Floating dolphin** — always-on-top, draggable, persists its position.
- **Global shortcut** — default `Ctrl+Alt+Space`. Configurable in settings.
- **Toolbox overlay** — transparent screen overlay; widgets cluster near the dolphin and the toolbar grows in the direction of more screen space.
- **To-do sheets** — 18 rows per sheet, with rich checkbox states (in progress, done, meeting, deferred, delegated, important, comment, optional, personal, follow-up, canceled, and reserved states for future use). Drag rows to reorder.
- **Date header** — type any date in the title (e.g. `5/12/2026`) and it displays as "Tuesday, May 12th, 2026 (Week 20)".
- **Sheet history** — unlimited sheets, navigated with `‹ ›` or the sheets dropdown.
- **Notes** — two Markdown pads beside the to-do list, each with its own edit/preview toggle and `.md` open/save:
  - **Day Notes** — belongs to the displayed sheet, so every day has its own notes.
  - **Scratchpad** — permanent; stays the same whichever day is displayed.
- **Calculator** — basic arithmetic with keyboard support.
- **Calendar** — month grid with ISO week numbers; click a date to open its task list (or create one on the spot). Dates that already have a list are marked with a dot, and a "Today" button jumps back to the current month. Week start (Sunday/Monday) is configurable in settings.
- **Timer / Stopwatch / Pomodoro** — runs in the background; remaining time appears as a pill above the dolphin icon. Timer length, and the Pomodoro work and break lengths, are set per session in the widget (Pomodoro defaults to 25 / 5).
- **AI agents** — AI tools can read and update your to-do lists, Day Notes, Scratchpad and timer (see [AI agents](#ai-agents)):
  - **On this computer** (Claude Code, Claude Desktop & Cowork, Codex, or anything that speaks MCP or HTTP): connect them once from the Agent Console, and their changes show up in the toolbox right away.
  - **On another computer**: the **Agent Console** (🤖) runs commands an assistant writes for you. Copy the AI instructions into your chat, then paste the commands it produces; the console previews what each one does before you run it.
  - An **Activity** log lists everything agents did.
- **Settings** — rebind the global shortcut by pressing keys; switch checkbox interaction mode (popup palette vs. left-click cycle); pick dolphin icon style and customize its colors (body/eye, plus the colors shown while the toolbox is open); set the app accent color; control toolbar expansion direction; choose whether the calendar week starts on Sunday or Monday. The installed version is shown beside the Quit button, with how often to check for updates (every hour, every day, only at startup, or never) and a **Check now** button.

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

## AI agents

Open the toolbox and click 🤖 (**Agent Console**).

### Agents on this computer

While the app runs, it serves a local API on `127.0.0.1:47821` (this computer only). The **Connect** tab has ready-to-paste setups with your paths and token filled in:

- **Claude Desktop & Cowork**: a `claude_desktop_config.json` entry. It runs a small MCP bridge (`dist-main/bridge/mcp-stdio.js`) with the app's own executable, so Node isn't needed.
- **Claude Code**: a `claude mcp add` command (MCP over HTTP).
- **Codex**: a `~/.codex/config.toml` entry (same bridge as Claude Desktop).
- **Anything else**: `POST /mcp` (MCP, Streamable HTTP) or `POST /api/<command>` with the arguments as a JSON body; `GET /api` lists the commands. Requests need `Authorization: Bearer <token>`. While the app runs, the URL and token are also in `agent-api.json` in the app's data folder.

Requests from web pages are refused, and you can turn access off or change the port in the Connect tab. The bridge setups use the installed app's path, so they don't work with the portable build (it runs from a temporary folder); use the installer, or the HTTP setup.

### Agents on another computer

1. In the **Run** tab, click **Copy AI instructions** and paste them into your chat (or a project's instructions).
2. Ask for what you want. The assistant answers with commands, one per line:
   ```
   add_todos {"date":"tomorrow","items":[{"text":"Call the dentist"},{"text":"Send the invoice","flags":["important"]}]}
   update_todo {"match":"quarterly report","status":"done"}
   ```
3. Paste them into the console, check the preview, and click **Run**. Commands stop at the first error. For commands that read (`get_day`, `search`, …), **Copy results** gives you something to paste back to the assistant.

### Commands

| Command | What it does |
| --- | --- |
| `get_day`, `list_days`, `search` | Read a day's to-dos and notes, list days with counts, search to-dos and notes |
| `add_todos`, `update_todo`, `remove_todo`, `move_todo`, `set_todos` | Edit a day's to-do list (rows are picked by number or by text) |
| `carry_over` | Copy one day's unfinished to-dos to another day and mark the originals deferred |
| `delete_day` | Delete a day's list and notes |
| `write_day_notes`, `get_scratchpad`, `write_scratchpad` | Add to (at the end or the start) or replace a day's notes; read or write the Scratchpad |
| `control_timer`, `get_timer` | Start, pause, resume, reset or clear the stopwatch, timer or Pomodoro |
| `show_day` | Open the toolbox on a given day |

Days are `YYYY-MM-DD`, `today`, `tomorrow` or `yesterday`.

## Install

Pre-built Windows binaries are attached to each [GitHub Release](https://github.com/jdsaphir/saphirs-toolbox/releases):

- **Setup (`SaphirsToolbox-<version>-setup.exe`)** — installs the app, registers it in Add/Remove Programs, and auto-updates in place when new versions are released.
- **Portable (`SaphirsToolbox-<version>-portable.exe`)** — single self-contained executable. Drop it anywhere and double-click. No installation, no Add/Remove Programs entry. Update by downloading a new release.

The app lives in the system tray. Right-click the tray icon for Open / Hide / Settings / Quit, or click the dolphin to toggle the toolbox. There is also a Quit button at the bottom of the Settings panel, with the installed version next to it.

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

Installed (NSIS) builds check for updates via `electron-updater`: on launch, and then on the interval set in Settings (hourly by default). A found release downloads in the background and installs on quit. Portable and dev builds can't replace the running executable, so they report as much in Settings instead of offering a check.

An MCP bridge is the app's own executable run as plain Node, started from the install folder by whichever AI client connected to it. The client keeps it alive after the app quits, and Windows won't let the installer delete a running `.exe`, so both ends close those leftovers before the old version is removed: `build/installer.nsh` in the installer, and `closeLeftoverBridges()` in `src/main/updater.ts` on the way out. Clients start a fresh bridge on their next call.

## Stack

- Electron 33 (main + preload + two renderer windows: dolphin and overlay)
- Vite + React + TypeScript
- `better-sqlite3` for persistence
- `@resvg/resvg-js` + `to-ico` to rasterize the dolphin SVG into a multi-resolution `.ico`

## Roadmap / not yet built

- More tools: unit converter, color picker, clipboard history, regex tester, JSON formatter, world clock.
