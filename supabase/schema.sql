-- vocab-builder review schema
-- Run this once in the Supabase SQL editor after creating the project.
-- Safe to re-run: all statements are idempotent.

create table if not exists review_state (
  card_id          text primary key,
  ease_factor      real        not null default 2.5,
  interval_days    integer     not null default 0,
  repetitions      integer     not null default 0,
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists review_log (
  id             bigserial primary key,
  card_id        text        not null,
  rating         smallint    not null check (rating in (0, 1, 2)),  -- 0=fail, 1=hard, 2=easy
  reviewed_at    timestamptz not null default now(),
  prev_interval  integer,
  next_interval  integer,
  prev_ease      real,
  next_ease      real
);

create index if not exists review_state_due_at_idx  on review_state (due_at);
create index if not exists review_log_card_time_idx on review_log (card_id, reviewed_at desc);

-- Keep updated_at fresh on every upsert.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists review_state_set_updated_at on review_state;
create trigger review_state_set_updated_at
  before update on review_state
  for each row execute function set_updated_at();

-- Row Level Security: only authenticated users (just you) can read/write.
-- Public (anon) reads are blocked by default once RLS is on.
alter table review_state enable row level security;
alter table review_log   enable row level security;

drop policy if exists "authed_rw_state" on review_state;
create policy "authed_rw_state" on review_state
  for all to authenticated
  using (true) with check (true);

drop policy if exists "authed_rw_log" on review_log;
create policy "authed_rw_log" on review_log
  for all to authenticated
  using (true) with check (true);
