-- Gym App — Supabase initial schema (M2 / C6)
-- Mirrors the prototype's persisted local shape (localStorage key `gymapp_v2`)
-- so client migration is a straight upload of existing local data.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  handle text unique,
  -- intake / settings (mirrors prototype `settings`)
  goal text not null default 'general' check (goal in ('muscle','fat','strength','endurance','general')),
  muscles text[] not null default '{}',
  level text not null default 'intermediate' check (level in ('beginner','intermediate','advanced')),
  kit text not null default 'dbbw' check (kit in ('bw','dbbw')),
  session_len int not null default 30 check (session_len in (10,20,30,45,60)),
  avail_days int[] not null default '{1,3,5}',        -- 0=Sun..6=Sat
  pref_time text not null default 'morning' check (pref_time in ('morning','lunch','evening')),
  dietary text[] not null default '{}',               -- subset of {veg,lf,gf,nf} — HEALTH REQUIREMENTS (hard filters)
  injuries text[] not null default '{}',              -- subset of {knee,shoulder,back,wrist}
  -- body profile
  height_cm numeric, age int, sex text check (sex in ('m','f')),
  mobility boolean[] not null default '{false,false,false,false,false}',
  -- liability evidence (C7): required before any plan is served
  disclaimer_accepted_at timestamptz,
  disclaimer_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (                                  -- workouts, walks, rides, sports; ALSO device-imported (M4)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  type text not null,                                  -- Workout|Walk|Ride|Run|Swim|Squash|Tennis|Other sport
  minutes int not null check (minutes > 0),
  avg_hr int, distance_km numeric,
  source text not null default 'manual' check (source in ('manual','app','health_connect','healthkit')),
  external_id text,                                    -- dedupe key for device imports
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table checkins (
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  sleep int not null check (sleep between 1 and 5),
  stress int not null check (stress between 1 and 5),
  energy int not null check (energy between 1 and 5),
  primary key (user_id, date)
);

create table weights (
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  kg numeric not null check (kg between 20 and 300),
  source text not null default 'manual',
  primary key (user_id, date)
);

create table hydration (
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  ml int not null default 0,
  primary key (user_id, date)
);

create table friendships (                             -- C10
  requester uuid not null references profiles(id) on delete cascade,
  addressee uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create table challenges (                              -- C11: server-defined weekly challenges
  id uuid primary key default gen_random_uuid(),
  week_start date not null,                            -- always a Sunday
  metric text not null default 'active_minutes',
  target int not null default 150,
  unique (week_start, metric)
);

create table challenge_members (
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- Leaderboard is a VIEW computed from events, never client-reported:
create view weekly_active_minutes as
  select e.user_id, date_trunc('week', e.date + 1)::date - 1 as week_start, sum(e.minutes) as minutes
  from events e group by 1, 2;

-- RLS: owners read/write their rows; friends may read each other's weekly minutes (not raw events).
alter table profiles enable row level security;
alter table events enable row level security;
alter table checkins enable row level security;
alter table weights enable row level security;
alter table hydration enable row level security;
alter table friendships enable row level security;
alter table challenge_members enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "public handle search" on profiles for select using (true);  -- expose only via a security-definer RPC returning (id, display_name, handle)
create policy "own events" on events for all using (auth.uid() = user_id);
create policy "own checkins" on checkins for all using (auth.uid() = user_id);
create policy "own weights" on weights for all using (auth.uid() = user_id);
create policy "own hydration" on hydration for all using (auth.uid() = user_id);
create policy "own friendships" on friendships for all using (auth.uid() in (requester, addressee));
create policy "own membership" on challenge_members for all using (auth.uid() = user_id);
