import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;
let dbInitialized = false;

function getSql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL!);
  }
  return _sql;
}

export async function ensureDb() {
  const sql = getSql();
  if (dbInitialized) return sql;

  await sql`
    CREATE TABLE IF NOT EXISTS fm_members (
      id SERIAL PRIMARY KEY,
      family_code VARCHAR(8) NOT NULL,
      name VARCHAR(100) NOT NULL,
      age_group VARCHAR(20) DEFAULT 'adult',
      avatar_color VARCHAR(7) DEFAULT '#6366f1',
      likes TEXT[] DEFAULT '{}',
      dislikes TEXT[] DEFAULT '{}',
      restrictions TEXT[] DEFAULT '{}',
      allergies TEXT[] DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS fm_meals (
      id SERIAL PRIMARY KEY,
      family_code VARCHAR(8) NOT NULL,
      name VARCHAR(200) NOT NULL,
      meal_type VARCHAR(20) DEFAULT 'dinner',
      meal_date DATE DEFAULT CURRENT_DATE,
      rating INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_fm_members_family ON fm_members(family_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fm_meals_family ON fm_meals(family_code)`;

  dbInitialized = true;
  return sql;
}
test content
