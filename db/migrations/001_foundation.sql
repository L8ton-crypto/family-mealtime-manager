-- Slice 0: foundation. Drop the old multi-tenant tables (both empty) and
-- recreate fm_members in the single-tenant shape, plus the login rate limit table.

DROP TABLE IF EXISTS fm_meals;
DROP TABLE IF EXISTS fm_members;

CREATE TABLE fm_members (
  id serial primary key,
  name text not null,
  age_group text not null default 'adult',
  colour text not null default '#FF4F0F',
  likes jsonb not null default '[]',
  dislikes jsonb not null default '[]',
  restrictions jsonb not null default '[]',
  allergies jsonb not null default '[]',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

CREATE TABLE fm_login_attempts (
  ip text not null,
  attempted_at timestamptz not null default now()
);

CREATE INDEX fm_login_attempts_ip_time_idx ON fm_login_attempts (ip, attempted_at);
