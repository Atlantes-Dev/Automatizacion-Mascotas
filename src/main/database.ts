import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'mascotas.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      cookies TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      monitored INTEGER NOT NULL DEFAULT 0,
      last_scanned_at TEXT DEFAULT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_account_url ON groups(account_id, url);

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      post_url TEXT NOT NULL UNIQUE,
      author_name TEXT NOT NULL DEFAULT '',
      author_url TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      published_at TEXT NOT NULL DEFAULT '',
      collected_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      status TEXT NOT NULL DEFAULT 'nuevo' CHECK(status IN ('nuevo', 'revisado', 'descartado', 'contactado')),
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS extraction_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      finished_at TEXT DEFAULT NULL,
      groups_total INTEGER NOT NULL DEFAULT 0,
      groups_done INTEGER NOT NULL DEFAULT 0,
      posts_found INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'stopped'))
    );

    -- Cada post visto en cada run. Un post puede aparecer en N runs (reapariciones).
    -- 'is_new' = 1 si esta fue la primera vez que se vio (insert efectivo en pets);
    -- 'is_new' = 0 si ya existía (INSERT OR IGNORE descartó).
    CREATE TABLE IF NOT EXISTS extraction_run_posts (
      run_id INTEGER NOT NULL,
      pet_id INTEGER NOT NULL,
      is_new INTEGER NOT NULL DEFAULT 0,
      seen_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (run_id, pet_id),
      FOREIGN KEY (run_id) REFERENCES extraction_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_erp_run ON extraction_run_posts(run_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);
}
