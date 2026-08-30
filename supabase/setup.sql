-- PesoWise cloud sync — run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- One row per user holding the whole budget as JSON. Row Level Security
-- ensures each signed-in user can only ever read/write their own row.

create table if not exists public.budgets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.budgets enable row level security;

drop policy if exists "Users manage their own budget" on public.budgets;
create policy "Users manage their own budget"
  on public.budgets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
