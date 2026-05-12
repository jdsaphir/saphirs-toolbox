import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { EMPTY_TODO, Sheet, Settings, TODOS_PER_SHEET, TodoItem } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  shortcut: 'Ctrl+Alt+Space',
  checkboxMode: 'palette',
  dolphinIcon: 'duotone',
  dolphinX: -1,        // -1 means "uninitialized; place at default"
  dolphinY: -1,
  toolboxSide: 'auto',
};

let db: Database.Database;

export function initDb(): void {
  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, 'toolbox.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sheets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      display_date  TEXT,
      scratchpad    TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todos (
      sheet_id    INTEGER NOT NULL,
      position    INTEGER NOT NULL,
      text        TEXT NOT NULL DEFAULT '',
      progress    TEXT NOT NULL DEFAULT 'empty',
      meeting       INTEGER NOT NULL DEFAULT 0,
      deferred      INTEGER NOT NULL DEFAULT 0,
      delegated     INTEGER NOT NULL DEFAULT 0,
      important     INTEGER NOT NULL DEFAULT 0,
      comment       INTEGER NOT NULL DEFAULT 0,
      chevron_up    INTEGER NOT NULL DEFAULT 0,
      chevron_down  INTEGER NOT NULL DEFAULT 0,
      circle        INTEGER NOT NULL DEFAULT 0,
      personal    INTEGER NOT NULL DEFAULT 0,
      follow_up   INTEGER NOT NULL DEFAULT 0,
      canceled    INTEGER NOT NULL DEFAULT 0,
      optional    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sheet_id, position),
      FOREIGN KEY (sheet_id) REFERENCES sheets(id) ON DELETE CASCADE
    );
  `);

  migrateTodosToCombinableStatuses();
}

// Migrate the todos table from the single-value `status` enum to the new
// progress + per-flag column model. Runs idempotently on every startup.
function migrateTodosToCombinableStatuses(): void {
  const cols = db.prepare('PRAGMA table_info(todos)').all() as Array<{ name: string }>;
  const have = new Set(cols.map(c => c.name));

  const addCol = (name: string, type: string, def: string) => {
    if (!have.has(name)) {
      db.exec(`ALTER TABLE todos ADD COLUMN ${name} ${type} NOT NULL DEFAULT ${def}`);
      have.add(name);
    }
  };

  addCol('progress', 'TEXT', "'empty'");
  addCol('meeting', 'INTEGER', '0');
  addCol('deferred', 'INTEGER', '0');
  addCol('delegated', 'INTEGER', '0');
  addCol('important', 'INTEGER', '0');
  addCol('comment', 'INTEGER', '0');
  addCol('chevron_up', 'INTEGER', '0');
  addCol('chevron_down', 'INTEGER', '0');
  addCol('circle', 'INTEGER', '0');

  // If the legacy `status` column still exists, fold its value into the new
  // columns. The legacy column is left in place (SQLite ALTER TABLE can drop
  // columns only in 3.35+; cheap to leave it untouched).
  if (have.has('status')) {
    db.exec(`UPDATE todos SET progress = 'in_progress' WHERE status = 'in_progress' AND progress = 'empty'`);
    db.exec(`UPDATE todos SET progress = 'done' WHERE status = 'done' AND progress = 'empty'`);
    db.exec(`UPDATE todos SET meeting = 1 WHERE status = 'meeting' AND meeting = 0`);
    db.exec(`UPDATE todos SET deferred = 1 WHERE status = 'deferred' AND deferred = 0`);
    db.exec(`UPDATE todos SET delegated = 1 WHERE status = 'delegated' AND delegated = 0`);
    db.exec(`UPDATE todos SET important = 1 WHERE status = 'important' AND important = 0`);
    db.exec(`UPDATE todos SET comment = 1 WHERE status = 'comment' AND comment = 0`);
    db.exec(`UPDATE todos SET chevron_up = 1 WHERE status = 'chevron_up' AND chevron_up = 0`);
    db.exec(`UPDATE todos SET chevron_down = 1 WHERE status = 'chevron_down' AND chevron_down = 0`);
    db.exec(`UPDATE todos SET circle = 1 WHERE status = 'circle' AND circle = 0`);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const out = { ...DEFAULT_SETTINGS } as Settings;
  for (const r of rows) {
    try {
      (out as any)[r.key] = JSON.parse(r.value);
    } catch {
      (out as any)[r.key] = r.value;
    }
  }
  return out;
}

export function setSettings(partial: Partial<Settings>): Settings {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction((p: Partial<Settings>) => {
    for (const [k, v] of Object.entries(p)) {
      stmt.run(k, JSON.stringify(v));
    }
  });
  tx(partial);
  return getSettings();
}

// ── Sheets ───────────────────────────────────────────────────────────────────

function rowToSheet(row: any, todos: TodoItem[]): Sheet {
  return {
    id: row.id,
    title: row.title,
    displayDate: row.display_date,
    scratchpad: row.scratchpad,
    todos,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadTodos(sheetId: number): TodoItem[] {
  const rows = db
    .prepare(
      `SELECT position, text, progress, meeting, deferred, delegated, important, comment,
              chevron_up, chevron_down, circle, personal, follow_up, canceled, optional
       FROM todos WHERE sheet_id = ? ORDER BY position ASC`
    )
    .all(sheetId) as any[];
  const todos: TodoItem[] = Array.from({ length: TODOS_PER_SHEET }, () => ({ ...EMPTY_TODO }));
  for (const r of rows) {
    if (r.position >= 0 && r.position < TODOS_PER_SHEET) {
      todos[r.position] = {
        text: r.text,
        progress: (r.progress ?? 'empty') as TodoItem['progress'],
        meeting: !!r.meeting,
        deferred: !!r.deferred,
        delegated: !!r.delegated,
        important: !!r.important,
        comment: !!r.comment,
        chevronUp: !!r.chevron_up,
        chevronDown: !!r.chevron_down,
        circle: !!r.circle,
        personal: !!r.personal,
        followUp: !!r.follow_up,
        canceled: !!r.canceled,
        optional: !!r.optional,
      };
    }
  }
  return todos;
}

export function listSheets(): Array<Pick<Sheet, 'id' | 'title' | 'displayDate' | 'createdAt' | 'updatedAt'>> {
  return db
    .prepare('SELECT id, title, display_date as displayDate, created_at as createdAt, updated_at as updatedAt FROM sheets ORDER BY COALESCE(display_date, created_at) DESC, created_at DESC')
    .all() as any;
}

export function getSheet(id: number): Sheet | null {
  const row = db.prepare('SELECT * FROM sheets WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToSheet(row, loadTodos(id));
}

export function getOrCreateLatestSheet(): Sheet {
  const latest = db.prepare('SELECT id FROM sheets ORDER BY COALESCE(display_date, created_at) DESC, created_at DESC LIMIT 1').get() as any;
  if (latest) return getSheet(latest.id)!;
  return createSheet({ title: '', displayDate: null });
}

export function createSheet(args: { title: string; displayDate: string | null }): Sheet {
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO sheets (title, display_date, scratchpad, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(args.title, args.displayDate, '', now, now);
  const id = Number(info.lastInsertRowid);
  // seed 18 empty todo rows
  const ins = db.prepare('INSERT INTO todos (sheet_id, position) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (let i = 0; i < TODOS_PER_SHEET; i++) ins.run(id, i);
  });
  tx();
  return getSheet(id)!;
}

export function updateSheet(sheet: Sheet): Sheet {
  const now = new Date().toISOString();
  db.prepare('UPDATE sheets SET title = ?, display_date = ?, scratchpad = ?, updated_at = ? WHERE id = ?')
    .run(sheet.title, sheet.displayDate, sheet.scratchpad, now, sheet.id);

  const upTodo = db.prepare(
    `UPDATE todos SET
       text = ?, progress = ?,
       meeting = ?, deferred = ?, delegated = ?, important = ?, comment = ?,
       chevron_up = ?, chevron_down = ?, circle = ?,
       personal = ?, follow_up = ?, canceled = ?, optional = ?
     WHERE sheet_id = ? AND position = ?`
  );
  const tx = db.transaction((s: Sheet) => {
    s.todos.forEach((t, i) => {
      upTodo.run(
        t.text, t.progress,
        t.meeting ? 1 : 0, t.deferred ? 1 : 0, t.delegated ? 1 : 0, t.important ? 1 : 0, t.comment ? 1 : 0,
        t.chevronUp ? 1 : 0, t.chevronDown ? 1 : 0, t.circle ? 1 : 0,
        t.personal ? 1 : 0, t.followUp ? 1 : 0, t.canceled ? 1 : 0, t.optional ? 1 : 0,
        s.id, i
      );
    });
  });
  tx(sheet);
  return getSheet(sheet.id)!;
}

export function deleteSheet(id: number): void {
  db.prepare('DELETE FROM todos WHERE sheet_id = ?').run(id);
  db.prepare('DELETE FROM sheets WHERE id = ?').run(id);
}
