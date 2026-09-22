import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Lazily-created Neon client. No schema creation at runtime: migrations live
// in db/migrations and are applied by scripts/migrate.mjs. Only tables
// prefixed `fm_` belong to this app — the database is shared with unrelated
// projects.
let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

// A Proxy so `sql` stays lazy (no client, no DATABASE_URL read at import
// time) while still forwarding both tagged-template calls (`sql\`...\``) and
// method access (`sql.query(...)`, `sql.transaction(...)`) to the real
// client once it exists.
export const sql: NeonQueryFunction<false, false> = new Proxy(
  (() => {}) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_target, _thisArg, args) {
      const client = getSql() as unknown as (...a: unknown[]) => unknown;
      return client(...args);
    },
    get(_target, prop) {
      const client = getSql() as unknown as Record<string | symbol, unknown>;
      return client[prop];
    },
  }
);
