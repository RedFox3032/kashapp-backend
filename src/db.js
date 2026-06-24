import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '..', 'kashapp.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    cashtag TEXT UNIQUE,
    date_of_birth TEXT,
    pin_hash TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS otps (
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    counterparty_name TEXT NOT NULL,
    subtitle TEXT,
    amount REAL NOT NULL,
    is_received INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tag TEXT NOT NULL,
    nickname TEXT,
    color INTEGER NOT NULL DEFAULT 4278190080,
    initials TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Migration: add nickname column if missing (for existing databases)
try {
  db.exec(`ALTER TABLE contacts ADD COLUMN nickname TEXT`);
} catch (_) {}

export default db;
