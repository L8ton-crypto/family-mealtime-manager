-- Slice 3: The Engine. Plate verdicts, one per (plan entry, member).

CREATE TABLE IF NOT EXISTS fm_ratings (
  id serial primary key,
  recipe_id integer not null references fm_recipes(id) on delete cascade,
  member_id integer not null references fm_members(id) on delete cascade,
  entry_id integer references fm_plan_entries(id) on delete set null,
  verdict text not null,                             -- clean | half | left   (how the plate came back)
  note text,
  rated_at timestamptz not null default now(),
  unique (entry_id, member_id)
);

CREATE INDEX IF NOT EXISTS fm_ratings_recipe_member_idx ON fm_ratings(recipe_id, member_id, rated_at desc);
