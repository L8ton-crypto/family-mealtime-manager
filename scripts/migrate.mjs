#!/usr/bin/env node
// Applies db/migrations/*.sql in order against DATABASE_URL, tracking applied
// files in fm_migrations so re-runs are idempotent. Reads .env.local by hand
// (no dotenv dependency) when DATABASE_URL isn't already in the environment,
// so `npm run migrate` works locally and `npm run build` works unattended on
// Vercel (where env vars are already injected).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Splits a .sql file into individual statements on top-level semicolons,
// ignoring semicolons inside single-quoted string literals. Sufficient for
// the plain DDL statements this project's migrations contain.
function splitStatements(sqlText) {
  const statements = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (ch === "'") inString = !inString;
    if (ch === ';' && !inString) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

// Strips `-- ...` line comments before splitting so a comment containing a
// semicolon can't be mistaken for a statement boundary.
function stripLineComments(sqlText) {
  return sqlText
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

async function main() {
  loadEnvLocal();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (checked process.env and .env.local)');
  }

  const sql = neon(databaseUrl);

  await sql.query(
    'CREATE TABLE IF NOT EXISTS fm_migrations (name text primary key, applied_at timestamptz not null default now())'
  );

  const migrationsDir = path.join(rootDir, 'db', 'migrations');
  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];

  if (files.length === 0) {
    console.log('No migration files found in db/migrations.');
    return;
  }

  const appliedRows = await sql.query('SELECT name FROM fm_migrations');
  const applied = new Set(appliedRows.map((r) => r.name));

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const fullPath = path.join(migrationsDir, file);
    const raw = readFileSync(fullPath, 'utf8');
    const statements = splitStatements(stripLineComments(raw));

    console.log(`apply ${file} (${statements.length} statement${statements.length === 1 ? '' : 's'})`);

    // Every statement in the file, plus the fm_migrations bookkeeping
    // insert, run as ONE transaction. If any statement fails, the whole
    // file (including the parts that "succeeded" before the failure) rolls
    // back together — a half-applied file is never recorded as applied,
    // and never leaves partial schema changes behind to break the next run
    // or the next deploy.
    await sql.transaction((txn) => [
      ...statements.map((statement) => txn.query(statement)),
      txn.query('INSERT INTO fm_migrations (name) VALUES ($1)', [file]),
    ]);

    ranAny = true;
    console.log(`done  ${file}`);
  }

  if (!ranAny) {
    console.log('Nothing to apply. Database is up to date.');
  } else {
    console.log('Migrations complete.');
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
