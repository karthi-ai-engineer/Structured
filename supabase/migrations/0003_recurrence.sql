-- Phase 3, WP1: recurring tasks (PLAN.md T12, T18).
--
-- The recurrence columns already exist (0001): a series row has `repeat_rule`; an override row
-- has `series_id` + `occurrence_date`. This migration adds what needs to be atomic:
--   split_series:       "this and future" edits and deletes
--   seed_default_tasks: the "Rise and Shine" / "Wind Down" series, created once
-- Both run as the caller (security invoker), so the open-access policy applies as usual.

-- Set once, when the default series are created (by whichever device gets there first).
alter table public.settings add column seeded_at timestamptz;

-- Ends a series before `p_from` and, with `p_new`, starts its replacement on the same call.
--   p_from: the first date the old series no longer covers (after its start).
--   p_new:  the replacement task as JSON (tasks columns; `id` from the client), a new series when
--           it has a `repeat_rule`, a one-off task otherwise. Null only ends the series.
-- Overrides from `p_from` on are discarded, except completed ones when a new series follows:
-- those move to it, so finished occurrences stay finished.
create or replace function public.split_series(p_series_id uuid, p_from date, p_new jsonb default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start date;
  v_new public.tasks;
begin
  select t.date into v_start
    from public.tasks t
   where t.id = p_series_id and t.repeat_rule is not null and t.deleted_at is null
     for update;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;
  if p_from <= v_start then
    raise exception 'the split date must be after the series start' using errcode = '22023';
  end if;

  update public.tasks
     set repeat_until = least(coalesce(repeat_until, p_from - 1), p_from - 1)
   where id = p_series_id;

  if p_new is not null then
    v_new := jsonb_populate_record(null::public.tasks, p_new);
    insert into public.tasks (
      id, title, notes, icon, color, subtasks, date, start_time, duration_min, is_all_day,
      repeat_rule, repeat_until, completed_at, source
    ) values (
      coalesce(v_new.id, gen_random_uuid()), v_new.title, v_new.notes, v_new.icon,
      coalesce(v_new.color, 'coral'), coalesce(v_new.subtasks, '[]'::jsonb), v_new.date,
      v_new.start_time, coalesce(v_new.duration_min, 30), coalesce(v_new.is_all_day, false),
      v_new.repeat_rule, v_new.repeat_until, v_new.completed_at, 'app'
    )
    returning * into v_new;

    if v_new.repeat_rule is not null then
      update public.tasks
         set series_id = v_new.id
       where series_id = p_series_id and occurrence_date >= p_from
         and completed_at is not null and deleted_at is null;
    end if;
  end if;

  update public.tasks
     set deleted_at = now()
   where series_id = p_series_id and occurrence_date >= p_from and deleted_at is null;
end;
$$;

-- Creates the default daily series once. Returns true when this call created them.
create or replace function public.seed_default_tasks(p_today date, p_rise time, p_wind time)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.settings set seeded_at = now() where id = 1 and seeded_at is null;
  if not found then
    return false;
  end if;
  insert into public.tasks (title, icon, color, date, start_time, duration_min, repeat_rule)
  values
    ('Rise and Shine', 'sunrise', 'orange', p_today, p_rise, 0, 'FREQ=DAILY'),
    ('Wind Down', 'moon', 'indigo', p_today, p_wind, 0, 'FREQ=DAILY');
  return true;
end;
$$;

revoke all on function public.split_series(uuid, date, jsonb) from public;
revoke all on function public.seed_default_tasks(date, time, time) from public;
grant execute on function public.split_series(uuid, date, jsonb) to anon, authenticated, service_role;
grant execute on function public.seed_default_tasks(date, time, time) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
