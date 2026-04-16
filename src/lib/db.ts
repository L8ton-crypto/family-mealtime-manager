import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;
let _initialized = false;

function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

export async function ensureDb() {
  if (_initialized) return getSql();
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS fm_members (
      id SERIAL PRIMARY KEY,
      family_code TEXT NOT NULL,
      name TEXT NOT NULL,
      age_group TEXT NOT NULL DEFAULT 'adult',
      avatar_color TEXT NOT NULL DEFAULT '#10b981',
      likes JSONB NOT NULL DEFAULT '[]',
      dislikes JSONB NOT NULL DEFAULT '[]',
      restrictions JSONB NOT NULL DEFAULT '[]',
      allergies JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fm_meals (
      id SERIAL PRIMARY KEY,
      family_code TEXT NOT NULL,
      name TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'dinner',
      meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
      rating INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS fm_members_code_idx ON fm_members(family_code)`;
  await sql`CREATE INDEX IF NOT EXISTS fm_meals_code_idx ON fm_meals(family_code)`;
  await sql`CREATE INDEX IF NOT EXISTS fm_meals_date_idx ON fm_meals(meal_date DESC)`;
  _initialized = true;
  return sql;
}
