-- Slice 1: The Menu. Recipes and their ingredient lines.

CREATE TABLE IF NOT EXISTS fm_recipes (
  id serial primary key,
  name text not null,
  description text not null default '',
  meal_types jsonb not null default '["dinner"]',
  tags jsonb not null default '[]',
  servings integer not null default 4,
  prep_minutes integer not null default 0,
  cook_minutes integer not null default 0,
  method jsonb not null default '[]',
  source_url text,
  favourite boolean not null default false,
  archived boolean not null default false,
  seeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS fm_recipe_ingredients (
  id serial primary key,
  recipe_id integer not null references fm_recipes(id) on delete cascade,
  position integer not null default 0,
  name text not null,
  quantity numeric,
  unit text,
  aisle text not null default 'pantry',
  allergens jsonb not null default '[]',
  optional boolean not null default false,
  note text
);

CREATE INDEX IF NOT EXISTS fm_recipe_ingredients_recipe_idx ON fm_recipe_ingredients(recipe_id, position);
