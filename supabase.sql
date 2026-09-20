-- CA Vault: free Supabase cloud-sync schema
-- Run this entire script in Supabase Dashboard -> SQL Editor.
create table if not exists public.ca_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.ca_custom_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.ca_progress enable row level security;
alter table public.ca_custom_items enable row level security;

drop policy if exists "Users manage own CA progress" on public.ca_progress;
create policy "Users manage own CA progress" on public.ca_progress
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own custom CA" on public.ca_custom_items;
create policy "Users manage own custom CA" on public.ca_custom_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
