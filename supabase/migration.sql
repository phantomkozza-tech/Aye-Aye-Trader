-- ============================================================
-- Aye Aye Trader — Supabase migration
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) PROFILES — your operator control panel (billing, trial, lockout)
--    You manage this from the Supabase Table editor.
--    'status' = your kill switch.  'plan' is written by Stripe later.
create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text,
  plan                     text not null default 'trial',    -- trial | active | expired | canceled
  status                   text not null default 'active',   -- active | disabled  (flip to 'disabled' to lock someone out)
  trial_started_at         timestamptz not null default now(),
  accounts_created_lifetime int  not null default 0,         -- reserved for hard trial caps later
  stripe_customer_id       text,
  stripe_subscription_id   text,
  note                     text,                             -- free-text for you (e.g. "refunded 2026-06-21")
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 2) JOURNALS — the whole journal, server-side, one JSON blob per user
create table if not exists public.journals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3) Row Level Security — a user can only ever touch their OWN rows
alter table public.profiles enable row level security;
alter table public.journals enable row level security;

-- profiles: user may READ their own profile (to see plan / trial days).
-- They CANNOT write it — only you (service role) and Stripe change plan/status.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- journals: full self-access to your own journal row
drop policy if exists "journals_all_own" on public.journals;
create policy "journals_all_own" on public.journals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Auto-create profile + empty journal when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.journals (user_id, data)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists journals_touch on public.journals;
create trigger journals_touch before update on public.journals
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 6) BACKFILL — create rows for any users who already existed before this migration
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.journals (user_id, data)
select id, '{}'::jsonb from auth.users
on conflict (user_id) do nothing;

-- ============================================================
-- HOW YOU USE THIS (operator notes):
--   • Lock someone out instantly: set profiles.status = 'disabled'.
--   • After a Stripe refund: also set plan = 'canceled' and add a note.
--   • See who's on trial / paid: filter profiles by plan.
--   • A user's whole journal is in journals.data (jsonb) keyed by user_id.
-- ============================================================
