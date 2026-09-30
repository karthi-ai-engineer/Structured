-- 0001_init.sql: initial schema (PLAN.md sections 7.1 and 7.2). Apply with `npm run db:push`.
-- Single user, no login: no user_id columns. RLS is on with open_access policies for anon and
-- authenticated; SSO later replaces them (PLAN.md section 14, "Later: SSO / login").
-- Deliberate additions to PLAN.md 7.1 (docs/phases/phase-0/PLAN.md D0-9, D0-21, D0-22):
--   settings check constraints, day_notes.updated_at + trigger, explicit Data API grants,
--   and a PostgREST schema-cache reload.

create extension if not exists pgcrypto;

-- settings (exactly one row)
create table public.settings (
  id               smallint primary key default 1 check (id = 1),
  timezone         text     not null default 'UTC',            -- set from the browser on first app open
  time_format      text     not null default '24h' check (time_format in ('12h','24h')),
  week_start       smallint not null default 1 check (week_start between 0 and 6),   -- 0 = Sun, 1 = Mon
  day_start        time     not null default '07:00',
  day_end          time     not null default '22:00',
  default_duration int      not null default 30 check (default_duration between 1 and 1440),
  default_alerts   int[]    not null default '{0}',            -- minutes before start
  energy_enabled   boolean  not null default true,
  energy_limit     int      not null default 30 check (energy_limit > 0),
  focus_minutes    int      not null default 25 check (focus_minutes > 0),
  break_minutes    int      not null default 5 check (break_minutes >= 0),
  theme            text     not null default 'system' check (theme in ('system','light','dark')),
  updated_at       timestamptz not null default now()
);

-- goals (targets / projects)
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  color         text not null default 'blue',
  icon          text,
  target_type   text not null default 'tasks' check (target_type in ('tasks','minutes','percent')),
  target_value  int,
  manual_value  int not null default 0,
  start_date    date,
  deadline      date,
  status        text not null default 'active' check (status in ('active','done','archived')),
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- tasks: one-off, inbox, recurring series and per-occurrence overrides (PLAN.md 7.1)
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  notes           text,
  icon            text,
  color           text not null default 'coral',
  subtasks        jsonb not null default '[]',
  date            date,
  start_time      time,
  duration_min    int not null default 30 check (duration_min between 0 and 1440),
  is_all_day      boolean not null default false,
  energy          smallint check (energy between -1 and 3),
  priority        smallint check (priority between 1 and 3),
  due_date        date,
  goal_id         uuid references public.goals on delete set null,
  alerts          int[],
  repeat_rule     text,
  repeat_until    date,
  series_id       uuid references public.tasks on delete cascade,
  occurrence_date date,
  is_cancelled    boolean not null default false,
  completed_at    timestamptz,
  inbox_order     double precision not null default 0,
  source          text not null default 'app' check (source in ('app','mcp','template','import')),
  batch_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (series_id, occurrence_date)
);
create index tasks_date_idx      on public.tasks (date)      where deleted_at is null;
create index tasks_series_idx    on public.tasks (series_id) where series_id is not null;
create index tasks_recurring_idx on public.tasks (date)      where repeat_rule is not null and deleted_at is null;
create index tasks_goal_idx      on public.tasks (goal_id);

-- focus sessions (actual time log)
create table public.focus_sessions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks on delete set null,
  goal_id     uuid references public.goals on delete set null,
  kind        text not null default 'focus' check (kind in ('focus','break')),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  planned_min int,
  created_at  timestamptz not null default now()
);

-- day notes (shutdown review / journal); updated_at added (D0-22)
create table public.day_notes (
  date        date primary key,
  note        text,
  mood        smallint check (mood between 1 and 5),
  energy      smallint check (energy between 1 and 5),
  reviewed_at timestamptz,
  updated_at  timestamptz not null default now()
);

-- templates (Phase 5)
create table public.templates (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  items jsonb not null default '[]'
);

-- Data API grants: projects created after 2026-05-30 do not expose new public tables automatically.
grant select, insert, update, delete on table
  public.settings, public.goals, public.tasks, public.focus_sessions, public.day_notes, public.templates
  to anon, authenticated, service_role;

-- Row level security: open access for now (single user, no login).
alter table public.settings       enable row level security;
alter table public.goals          enable row level security;
alter table public.tasks          enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.day_notes      enable row level security;
alter table public.templates      enable row level security;

create policy "open_access" on public.settings       for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.goals          for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.tasks          for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.focus_sessions for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.day_notes      for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.templates      for all to anon, authenticated using (true) with check (true);

-- updated_at trigger (server-stamped; empty search_path avoids the advisor warning)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger settings_touch  before update on public.settings  for each row execute function public.touch_updated_at();
create trigger goals_touch     before update on public.goals     for each row execute function public.touch_updated_at();
create trigger tasks_touch     before update on public.tasks     for each row execute function public.touch_updated_at();
create trigger day_notes_touch before update on public.day_notes for each row execute function public.touch_updated_at();

-- Realtime
alter publication supabase_realtime add table public.tasks, public.goals, public.settings, public.day_notes;

-- Ask PostgREST to reload its schema cache (avoids PGRST205 right after the push).
notify pgrst, 'reload schema';
