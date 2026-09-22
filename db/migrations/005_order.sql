-- Slice 4: The Order. The shopping list, aggregated from the pass and
-- scaled to covers, one row per line (generated or manual).

CREATE TABLE IF NOT EXISTS fm_shopping_items (
  id serial primary key,
  week_start date not null,
  key text,                                          -- normalised "name|unit" for generated lines; null for manual
  name text not null,
  quantity numeric,
  unit text,
  aisle text not null default 'pantry',
  checked boolean not null default false,
  manual boolean not null default false,
  optional boolean not null default false,
  sources jsonb not null default '[]',               -- [{ entryId, recipeId, recipeName, quantity, unit }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fm_shopping_items_week_key_idx ON fm_shopping_items(week_start, key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fm_shopping_items_week_idx ON fm_shopping_items(week_start, aisle, checked);
