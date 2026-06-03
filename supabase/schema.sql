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

-- ============================================================================
-- Story Builder (vocab-builder app)
-- ============================================================================
-- AI-generated Indonesian short stories with ElevenLabs audio + word timings.
-- Stories persist across devices (created on phone, revisited later). Audio
-- lives in private object storage; clients fetch it via short-lived signed URLs
-- minted server-side.
--
-- IMPORTANT: this database is shared with another Vercel project that ALREADY
-- owns a `public.stories` table (menu_title/indo/english/user_id …). To avoid
-- colliding with it — and accidentally re-policying its data — this feature
-- uses its own namespaced table `vocab_stories` and bucket `vocab-story-audio`.
-- Nothing below touches the other project's tables.

create table if not exists vocab_stories (
  id              uuid primary key default gen_random_uuid(),
  topic           text        not null,
  status          text        not null default 'pending',  -- pending | ready | failed
  style           text        not null default 'story',    -- story | podcast
  title           text,                                    -- short English title for the list
  story_text      text,                                    -- generated Indonesian story
  translation_en  text,                                    -- faithful English translation
  audio_path      text,                                    -- key/path in the vocab-story-audio bucket
  word_timings    jsonb,                                   -- [{ text, start, end }]
  segments        jsonb,                                   -- podcast: [{ speaker, gender }] per paragraph
  model           text,
  voice_id        text,
  error           text,
  created_at      timestamptz not null default now()
);

alter table vocab_stories add column if not exists style text not null default 'story';
alter table vocab_stories add column if not exists segments jsonb;

create index if not exists vocab_stories_created_at_idx on vocab_stories (created_at desc);

-- This is a single-user personal site gated by Supabase auth, mirroring
-- review_state above: any authenticated user has full read/write.
alter table vocab_stories enable row level security;

drop policy if exists "authed_rw_vocab_stories" on vocab_stories;
create policy "authed_rw_vocab_stories" on vocab_stories
  for all to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Audio storage: a PRIVATE bucket. Clients never read it directly; the server
-- mints short-lived signed URLs. Only authenticated users can read/write.
-- The storage policy is SCOPED to this bucket so it can't affect any other
-- project's objects in the shared Storage.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vocab-story-audio', 'vocab-story-audio', false)
on conflict (id) do nothing;

drop policy if exists "authed_rw_vocab_story_audio" on storage.objects;
create policy "authed_rw_vocab_story_audio" on storage.objects
  for all to authenticated
  using (bucket_id = 'vocab-story-audio')
  with check (bucket_id = 'vocab-story-audio');

-- Cache of Claude word-choice explanations, keyed on (word, sentence) so the
-- same tap never costs tokens twice.
create table if not exists vocab_word_explanations (
  id               uuid primary key default gen_random_uuid(),
  word             text not null,
  indo_sentence    text not null,
  english_sentence text,
  explanation      text not null,
  created_at       timestamptz not null default now(),
  unique (word, indo_sentence)
);

alter table vocab_word_explanations enable row level security;

drop policy if exists "authed_rw_vocab_word_explanations" on vocab_word_explanations;
create policy "authed_rw_vocab_word_explanations" on vocab_word_explanations
  for all to authenticated
  using (true) with check (true);
