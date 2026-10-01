-- Phase 3, WP1 code review round 2: moving one occurrence is always "this task only", so a split
-- no longer shifts anything. Instead, `p_keep` names the edited occurrence whose own override
-- (for example a move to another day) carries over to the new series with the new values.
--
-- Overrides from `p_from` on: completed ones and the one on `p_keep` move to a new series (taking
-- its shared fields, keeping their own date and completion); the rest are discarded.

drop function if exists public.split_series(uuid, date, jsonb, int);

create or replace function public.split_series(
  p_series_id uuid,
  p_from date,
  p_new jsonb default null,
  p_keep date default null
)
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
         set series_id = v_new.id,
             title = v_new.title,
             notes = v_new.notes,
             icon = v_new.icon,
             color = v_new.color,
             start_time = v_new.start_time,
             duration_min = v_new.duration_min,
             is_all_day = v_new.is_all_day
       where series_id = p_series_id and occurrence_date >= p_from and deleted_at is null
         and (completed_at is not null or occurrence_date = p_keep);
    end if;
  end if;

  update public.tasks
     set deleted_at = now()
   where series_id = p_series_id and occurrence_date >= p_from and deleted_at is null;
end;
$$;

revoke all on function public.split_series(uuid, date, jsonb, date) from public;
grant execute on function public.split_series(uuid, date, jsonb, date) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
