-- ═══════════════════════════════════════════════════════════
-- VIDEO VAULT SCHEMA — run this once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Per-user per-item state: favorite, watch progress, folder
create table if not exists user_data (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  favorite    boolean default false,
  progress    real default 0,
  duration    real default 0,
  folder      text,
  updated_at  timestamptz default now(),
  unique(user_id, item_key)
);

-- Custom vault folders (separate from sheet tabs)
create table if not exists vault_folders (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null,
  created_at  timestamptz default now(),
  unique(user_id, name)
);

-- Per-user settings: sheet connection + view prefs
create table if not exists user_settings (
  user_id     uuid references auth.users on delete cascade primary key,
  sheet_id    text,
  manual_tabs jsonb,
  view_mode   text default 'showcase',
  updated_at  timestamptz default now()
);

-- Quick Adds: items added directly in the app (not from Google Sheets)
-- Synced per-user so they survive across devices and browser clears
create table if not exists vault_quick_adds (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_key    text not null,
  item_data   jsonb not null,
  created_at  timestamptz default now(),
  unique(user_id, item_key)
);

-- Row level security
alter table user_data        enable row level security;
alter table vault_folders    enable row level security;
alter table user_settings    enable row level security;
alter table vault_quick_adds enable row level security;

create policy "own user_data"     on user_data        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own vault_folders" on vault_folders    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own user_settings" on user_settings    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own quick_adds"    on vault_quick_adds for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_user_data_user        on user_data(user_id);
create index if not exists idx_user_data_key         on user_data(user_id, item_key);
create index if not exists idx_vault_quick_adds_user on vault_quick_adds(user_id);
