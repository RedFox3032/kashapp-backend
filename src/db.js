import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/kashapp',
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      cashtag TEXT UNIQUE,
      date_of_birth TEXT,
      pin_hash TEXT NOT NULL,
      balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      is_verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otps (
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      counterparty_name TEXT NOT NULL,
      subtitle TEXT,
      amount DOUBLE PRECISION NOT NULL,
      is_received BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

  // Migration: add nickname column if missing (PostgreSQL way)
  const { rows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'nickname'
  `);
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE contacts ADD COLUMN nickname TEXT`);
  }
}

export default pool;
