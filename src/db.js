// Opens the SQLite file and sets up tables and starting data.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDb } from './setup.js';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  return setupDb(db, readFileSync(join(here, 'schema.sql'), 'utf8'));
}

export { tx } from './tx.js';
export { DEFAULT_LIFTS, DEFAULT_SETTINGS } from './setup.js';
