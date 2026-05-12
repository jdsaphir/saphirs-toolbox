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
      status      TEXT NOT NULL DEFAULT 'empty',
      personal    INTEGER NOT NULL DEFAULT 0,
      follow_up   INTEGER NOT NULL DEFAULT 0,
      canceled    INTEGER NOT NULL DEFAULT 0,
      optional    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sheet_id, position),
      FOREIGN KEY (sheet_id) REFERENCES sheets(id) ON DELETE CASCADE
    );
  `);
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
    .prepare('SELECT position, text, status, personal, follow_up, canceled, optional FROM todos WHERE sheet_id = ? ORDER BY position ASC')
    .all(sheetId) as any[];
  const todos: TodoItem[] = Array.from({ length: TODOS_PER_SHEET }, () => ({ ...EMPTY_TODO }));
  for (const r of rows) {
    if (r.position >= 0 && r.position < TODOS_PER_SHEET) {
      todos[r.position] = {
        text: r.text,
        status: r.status,
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
    'UPDATE todos SET text=?, status=?, personal=?, follow_up=?, canceled=?, optional=? WHERE sheet_id=? AND position=?'
  );
  const tx = db.transaction((s: Sheet) => {
    s.todos.forEach((t, i) => {
      upTodo.run(t.text, t.status, t.personal ? 1 : 0, t.followUp ? 1 : 0, t.canceled ? 1 : 0, t.optional ? 1 : 0, s.id, i);
    });
  });
  tx(sheet);
  return getSheet(sheet.id)!;
}

export function deleteSheet(id: number): void {
  db.prepare('DELETE FROM todos WHERE sheet_id = ?').run(id);
  db.prepare('DELETE FROM sheets WHERE id = ?').run(id);
}
