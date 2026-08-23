-- Gym App — M2 / C6 initial schema.
--
-- Derived from project/supabase/0001_init.sql, which mirrors the prototype's
-- persisted local shape (localStorage key `gymapp_v2`) so client migration is a
-- straight upload of existing local data. Deviations from that draft are
-- listed in docs/M2-SCHEMA-CHANGELOG.md — the important one is that the draft's
-- `create policy "public handle search" on profiles for select using (true)`
-- exposed every column of every profile (height, age, injuries, dietary
-- requirements) to any signed-in user. Discovery goes through
-- `search_profiles()` instead, which returns three columns and nothing else.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  handle text unique
    check (handle is null or handle ~ '^[a-z0-9_]{3,24}$'),

  -- intake / settings (mirrors prototype `settings`)
  goal text not null default 'general'
    check (goal in ('muscle','fat','strength','endurance','general')),
  muscles text[] not null default '{}',
  level text not null default 'intermediate'
    check (level in ('beginner','intermediate','advanced')),
  kit text not null default 'dbbw' check (kit in ('bw','dbbw')),
  session_len int not null default 30 check (session_len in (10,20,30,45,60)),
  avail_days int[] not null default '{1,3,5}',          -- 0=Sun..6=Sat
  pref_time text not null default 'morning'
    check (pref_time in ('morning','lunch','evening')),
  dietary text[] not null default '{}',                 -- subset of {veg,lf,gf,nf} — HEALTH REQUIREMENTS (hard filters)
  injuries text[] not null default '{}',                -- subset of {knee,shoulder,back,wrist}

  -- body profile
  height_cm numeric check (height_cm is null or height_cm between 100 and 250),
  age int check (age is null or age between 13 and 120),
  sex text check (sex in ('m','f')),
  mobility boolean[] not null default '{false,false,false,false,false}',

  -- liability evidence (C7): required before any plan is served
  disclaimer_accepted_at timestamptz,
  disclaimer_version text,

  -- intake completion (C7): the wizard runs until this is set
  intake_completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- element-level guards; Postgres cannot express these as column checks
  constraint muscles_valid check (
    muscles <@ array['chest','back','legs','shoulders','arms','core','full']::text[]),
  constraint dietary_valid check (dietary <@ array['veg','lf','gf','nf']::text[]),
  constraint injuries_valid check (injuries <@ array['knee','shoulder','back','wrist']::text[]),
  constraint avail_days_valid check (
    avail_days <@ array[0,1,2,3,4,5,6]::int[]),
  constraint mobility_len check (array_length(mobility, 1) = 5),
  -- a version without a timestamp (or the reverse) is not usable as evidence
  constraint disclaimer_pair check (
    (disclaimer_accepted_at is null) = (disclaimer_version is null))
);

create table public.events (   -- workouts, walks, rides, sports; ALSO device-imported (M4)
  -- The id is generated client-side so a retried outbox flush upserts the same
  -- row instead of inserting a duplicate. Manual rows carry external_id = null,
  -- and NULLs are distinct in a unique index, so the dedupe key below cannot
  -- protect them.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  type text not null                                   -- Workout|Walk|Ride|Run|Swim|Squash|Tennis|Other sport
    check (type in ('Workout','Walk','Ride','Run','Swim','Squash','Tennis','Other sport')),
  minutes int not null check (minutes > 0 and minutes <= 1440),
  avg_hr int check (avg_hr is null or avg_hr between 20 and 250),
  distance_km numeric check (distance_km is null or distance_km >= 0),
  source text not null default 'manual'
    check (source in ('manual','app','health_connect','healthkit')),
  external_id text,                                    -- dedupe key for device imports (M4)
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index events_user_date_idx on public.events (user_id, date desc);

create table public.checkins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  sleep int not null check (sleep between 1 and 5),
  stress int not null check (stress between 1 and 5),
  energy int not null check (energy between 1 and 5),
  primary key (user_id, date)
);

create table public.weights (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  kg numeric not null check (kg between 20 and 300),
  source text not null default 'manual'
    check (source in ('manual','app','health_connect','healthkit')),
  primary key (user_id, date)
);

create table public.hydration (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  ml int not null default 0 check (ml >= 0 and ml <= 20000),
  primary key (user_id, date)
);

create table public.friendships (                      -- C10
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friendships_addressee_idx on public.friendships (addressee);

create table public.challenges (                       -- C11: server-defined weekly challenges
  id uuid primary key default gen_random_uuid(),
  week_start date not null,                            -- always a Sunday
  metric text not null default 'active_minutes',
  target int not null default 150 check (target > 0),
  unique (week_start, metric),
  -- 0 = Sunday in Postgres' dow, matching the app's Sunday week start
  constraint week_start_is_sunday check (extract(dow from week_start) = 0)
);

create table public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Derived data
-- ─────────────────────────────────────────────────────────────────────────────

-- Leaderboard input, computed from events and never client-reported.
-- security_invoker so the view honours the caller's RLS on `events`: through
-- this view you see only your own minutes. Friends' minutes come from
-- friend_leaderboard() below, which is the one deliberate, audited widening.
create view public.weekly_active_minutes
  with (security_invoker = true) as
  select
    e.user_id,
    (date_trunc('week', (e.date + 1)::timestamp)::date - 1) as week_start,
    sum(e.minutes)::bigint as minutes
  from public.events e
  group by 1, 2;

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────

create function public.touch_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every auth user gets a profile row immediately, so the disclaimer gate has
-- something to write to and the client never has to branch on "no profile yet".
create function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.checkins enable row level security;
alter table public.weights enable row level security;
alter table public.hydration enable row level security;
alter table public.friendships enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

-- profiles: your row, and only your row. Discovery is search_profiles().
create policy "own profile read" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "own profile insert" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "own profile update" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "own events" on public.events
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own checkins" on public.checkins
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own weights" on public.weights
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own hydration" on public.hydration
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- friendships: both parties can read the row and either can remove it, but only
-- the requester may create one (otherwise anyone could forge an inbound
-- request from someone else) and only the addressee may change its status.
create policy "friendship read" on public.friendships
  for select using ((select auth.uid()) in (requester, addressee));
create policy "friendship request" on public.friendships
  for insert with check ((select auth.uid()) = requester and status = 'pending');
create policy "friendship respond" on public.friendships
  for update using ((select auth.uid()) = addressee)
  with check ((select auth.uid()) = addressee);
create policy "friendship withdraw" on public.friendships
  for delete using ((select auth.uid()) in (requester, addressee));

-- challenges are server-defined reference data: readable by all signed-in
-- users, writable by nobody through the API.
create policy "challenges readable" on public.challenges
  for select to authenticated using (true);
revoke insert, update, delete on public.challenges from anon, authenticated;

create policy "own membership" on public.challenge_members
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Security-definer RPCs — the only widenings, each returning a fixed projection
-- ─────────────────────────────────────────────────────────────────────────────

-- Partner search. Returns three columns; height, age, injuries and dietary
-- requirements are not reachable through it. Only profiles that have set a
-- handle are discoverable, which makes discovery opt-in.
create function public.search_profiles(q text)
  returns table (id uuid, display_name text, handle text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.id, p.display_name, p.handle
  from public.profiles p
  where (select auth.uid()) is not null
    and p.id <> (select auth.uid())
    and p.handle is not null
    and length(btrim(q)) >= 2
    and (
      p.handle like '%' || lower(btrim(q)) || '%'
      or p.display_name ilike '%' || btrim(q) || '%'
    )
  order by p.handle
  limit 20;
$$;

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- Leaderboard for one week: you, your accepted friends, and anyone in the same
-- challenge. Minutes are summed server-side from `events`; the client never
-- reports a total. Raw events stay private — this returns only the sum.
create function public.friend_leaderboard(week_start date)
  returns table (user_id uuid, display_name text, handle text, minutes bigint)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  visible as (
    select id from me
    union
    select case when f.requester = m.id then f.addressee else f.requester end
    from public.friendships f, me m
    where f.status = 'accepted' and m.id in (f.requester, f.addressee)
    union
    select cm.user_id
    from public.challenge_members cm, me m
    where cm.challenge_id in (
      select challenge_id from public.challenge_members where user_id = m.id
    )
  )
  select
    p.id,
    p.display_name,
    p.handle,
    coalesce(sum(e.minutes), 0)::bigint as minutes
  from visible v
  join public.profiles p on p.id = v.id
  left join public.events e
    on e.user_id = p.id
   and e.date >= friend_leaderboard.week_start
   and e.date < friend_leaderboard.week_start + 7
  where (select auth.uid()) is not null
  group by p.id, p.display_name, p.handle
  order by minutes desc, p.display_name nulls last;
$$;

revoke all on function public.friend_leaderboard(date) from public, anon;
grant execute on function public.friend_leaderboard(date) to authenticated;
