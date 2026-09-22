-- Slice 2: The Pass. Weekly plan entries and their attendees.

CREATE TABLE IF NOT EXISTS fm_plan_entries (
  id serial primary key,
  service_date date not null,
  slot text not null,                                -- breakfast | lunch | dinner | snack
  recipe_id integer references fm_recipes(id) on delete set null,
  custom_name text,                                  -- used when recipe_id is null: "Leftovers", "Takeaway"
  servings integer,                                  -- null = number of attendees
  status text not null default 'planned',            -- planned | plated | eightysixed
  notes text,
  position integer not null default 0,               -- ordering within a slot; several tickets per slot allowed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipe_id is not null or custom_name is not null)
);

CREATE INDEX IF NOT EXISTS fm_plan_entries_date_idx ON fm_plan_entries(service_date, slot, position);

CREATE TABLE IF NOT EXISTS fm_plan_entry_attendees (
  entry_id integer not null references fm_plan_entries(id) on delete cascade,
  member_id integer not null references fm_members(id) on delete cascade,
  primary key (entry_id, member_id)
);
