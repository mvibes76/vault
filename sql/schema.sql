-- ═══════════════════════════════════════════════════════════
-- VIDEO VAULT v12 SCHEMA — Supabase is the real vault
-- Run this in Supabase SQL Editor.
-- Google Sheet is now a one-page mirror named "Vault Library", not source of truth.
-- ═══════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- App-native library items: every URL/file/link added inside the app lives here.
create table if not exists vault_items (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  url         text not null,
  title       text,
  note        text,
  tags        text[] default '{}',
  source      text,
  type        text default 'link',
  folder      text,
  thumbnail   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, item_key)
);

-- Per-user per-item state: favorite, watch progress, rating, current folder override.
create table if not exists user_data (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  favorite    boolean default false,
  progress    real default 0,
  duration    real default 0,
  folder      text,
  rating      int check (rating is null or rating between 1 and 5),
  rated_at    timestamptz,
  updated_at  timestamptz default now(),
  unique(user_id, item_key)
);

-- Native app folders. These replace the old Google Sheet tab workflow.
create table if not exists vault_folders (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null,
  created_at  timestamptz default now(),
  unique(user_id, name)
);

-- Timestamp marks for moments you rate or want to revisit.
create table if not exists vault_moment_marks (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  seconds     real default 0,
  rating      int check (rating is null or rating between 1 and 5),
  note        text,
  created_at  timestamptz default now()
);


-- Per-item comments. Private to each user. Useful for notes after watching/reviewing.
create table if not exists vault_comments (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  body        text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Per-user settings: sheet webhook/mirror config + view prefs.
create table if not exists user_settings (
  user_id     uuid references auth.users on delete cascade primary key,
  sheet_id    text,
  manual_tabs jsonb,
  view_mode   text default 'showcase',
  updated_at  timestamptz default now()
);

-- Legacy table kept so older installs don't break. v12 uses vault_items.
create table if not exists vault_quick_adds (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  item_data   jsonb not null,
  created_at  timestamptz default now(),
  unique(user_id, item_key)
);

alter table vault_items        enable row level security;
alter table user_data          enable row level security;
alter table vault_folders      enable row level security;
alter table vault_moment_marks enable row level security;
alter table vault_comments    enable row level security;
alter table user_settings      enable row level security;
alter table vault_quick_adds   enable row level security;

do $$ begin
  create policy "own vault_items" on vault_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own user_data" on user_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own vault_folders" on vault_folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own moment_marks" on vault_moment_marks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own vault_comments" on vault_comments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own user_settings" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own quick_adds" on vault_quick_adds for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists idx_vault_items_user        on vault_items(user_id);
create index if not exists idx_vault_items_key         on vault_items(user_id, item_key);
create index if not exists idx_vault_items_folder      on vault_items(user_id, folder);
create index if not exists idx_user_data_user          on user_data(user_id);
create index if not exists idx_user_data_key           on user_data(user_id, item_key);
create index if not exists idx_moment_marks_user_key   on vault_moment_marks(user_id, item_key);
create index if not exists idx_vault_comments_user_key on vault_comments(user_id, item_key);
create index if not exists idx_vault_quick_adds_user   on vault_quick_adds(user_id);

-- v19: dashboard and view tracking stats. Safe to rerun.
alter table user_data add column if not exists view_count int default 0;
alter table user_data add column if not exists first_viewed_at timestamptz;
alter table user_data add column if not exists last_viewed_at timestamptz;
alter table user_data add column if not exists completed_count int default 0;
alter table user_data add column if not exists watch_seconds real default 0;
create index if not exists idx_user_data_last_viewed on user_data(user_id, last_viewed_at);
create index if not exists idx_user_data_view_count on user_data(user_id, view_count);
