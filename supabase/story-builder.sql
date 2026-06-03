-- Story Builder migration for the vocab-builder app.
-- Safe to run on the SHARED database: every object below is namespaced with a
-- `vocab_` / `vocab-` prefix and uses IF NOT EXISTS / scoped policy names, so it
-- does NOT touch the other project's `public.stories` table or any other data.
-- Idempotent — safe to re-run.

create table if not exists vocab_stories (
  id              uuid primary key default gen_random_uuid(),
  topic           text        not null,
  status          text        not null default 'pending',  -- pending | ready | failed
  title           text,
  story_text      text,
  translation_en  text,
  audio_path      text,
  word_timings    jsonb,                                   -- [{ text, start, end }]
  model           text,
  voice_id        text,
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists vocab_stories_created_at_idx on vocab_stories (created_at desc);

alter table vocab_stories enable row level security;

drop policy if exists "authed_rw_vocab_stories" on vocab_stories;
create policy "authed_rw_vocab_stories" on vocab_stories
  for all to authenticated
  using (true) with check (true);

-- Private audio bucket + a policy scoped strictly to this bucket id.
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
