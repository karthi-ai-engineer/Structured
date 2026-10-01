-- Phase 3, WP5: priority (and the series due date) travel with recurring series, like energy
-- and alerts in 0006/0007. Bodies are otherwise unchanged.

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
      energy, alerts, priority, due_date, repeat_rule, repeat_until, completed_at, source
    ) values (
      coalesce(v_new.id, gen_random_uuid()), v_new.title, v_new.notes, v_new.icon,
      coalesce(v_new.color, 'coral'), coalesce(v_new.subtasks, '[]'::jsonb), v_new.date,
      v_new.start_time, coalesce(v_new.duration_min, 30), coalesce(v_new.is_all_day, false),
      v_new.energy, v_new.alerts, v_new.priority, v_new.due_date, v_new.repeat_rule, v_new.repeat_until, v_new.completed_at, 'app'
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
             is_all_day = v_new.is_all_day,
             energy = v_new.energy,
             alerts = v_new.alerts,
             priority = v_new.priority
       where series_id = p_series_id and occurrence_date >= p_from and deleted_at is null
         and (completed_at is not null or occurrence_date = p_keep);
    end if;
  end if;

  update public.tasks
     set deleted_at = now()
   where series_id = p_series_id and occurrence_date >= p_from and deleted_at is null;
end;
$$;

create or replace function public.update_series(
  p_series_id uuid,
  p_patch jsonb,
  p_shared jsonb default '{}'::jsonb,
  p_reset boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_until date;
begin
  perform 1
     from public.tasks t
    where t.id = p_series_id and t.repeat_rule is not null and t.deleted_at is null
      for update;
  if not found then
    raise exception 'series not found' using errcode = 'P0002';
  end if;

  update public.tasks t set
    title        = case when p_patch ? 'title' then p_patch->>'title' else t.title end,
    notes        = case when p_patch ? 'notes' then p_patch->>'notes' else t.notes end,
    icon         = case when p_patch ? 'icon' then p_patch->>'icon' else t.icon end,
    color        = case when p_patch ? 'color' then p_patch->>'color' else t.color end,
    subtasks     = case when p_patch ? 'subtasks' then p_patch->'subtasks' else t.subtasks end,
    date         = case when p_patch ? 'date' then (p_patch->>'date')::date else t.date end,
    start_time   = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else t.start_time end,
    duration_min = case when p_patch ? 'duration_min' then (p_patch->>'duration_min')::int else t.duration_min end,
    is_all_day   = case when p_patch ? 'is_all_day' then (p_patch->>'is_all_day')::boolean else t.is_all_day end,
    energy       = case when p_patch ? 'energy' then (p_patch->>'energy')::smallint else t.energy end,
    priority     = case when p_patch ? 'priority' then (p_patch->>'priority')::smallint else t.priority end,
    due_date     = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else t.due_date end,
    alerts       = case when p_patch ? 'alerts' then case when jsonb_typeof(p_patch->'alerts') = 'array' then coalesce((select array_agg(value::int) from jsonb_array_elements_text(p_patch->'alerts')), '{}') end else t.alerts end,
    completed_at = case when p_patch ? 'completed_at' then (p_patch->>'completed_at')::timestamptz else t.completed_at end,
    repeat_rule  = case when p_patch ? 'repeat_rule' then p_patch->>'repeat_rule' else t.repeat_rule end,
    repeat_until = case when p_patch ? 'repeat_until' then (p_patch->>'repeat_until')::date else t.repeat_until end
  where t.id = p_series_id
  returning t.repeat_until into v_until;

  if p_reset then
    update public.tasks
       set deleted_at = now()
     where series_id = p_series_id and completed_at is null and deleted_at is null;
  end if;

  if v_until is not null then
    update public.tasks
       set deleted_at = now()
     where series_id = p_series_id and occurrence_date > v_until and deleted_at is null;
  end if;

  if p_shared is not null and p_shared <> '{}'::jsonb then
    update public.tasks t set
      title        = case when p_shared ? 'title' then p_shared->>'title' else t.title end,
      notes        = case when p_shared ? 'notes' then p_shared->>'notes' else t.notes end,
      icon         = case when p_shared ? 'icon' then p_shared->>'icon' else t.icon end,
      color        = case when p_shared ? 'color' then p_shared->>'color' else t.color end,
      start_time   = case when p_shared ? 'start_time' then (p_shared->>'start_time')::time else t.start_time end,
      duration_min = case when p_shared ? 'duration_min' then (p_shared->>'duration_min')::int else t.duration_min end,
      is_all_day   = case when p_shared ? 'is_all_day' then (p_shared->>'is_all_day')::boolean else t.is_all_day end,
      energy       = case when p_shared ? 'energy' then (p_shared->>'energy')::smallint else t.energy end,
      priority     = case when p_shared ? 'priority' then (p_shared->>'priority')::smallint else t.priority end,
      alerts       = case when p_shared ? 'alerts' then case when jsonb_typeof(p_shared->'alerts') = 'array' then coalesce((select array_agg(value::int) from jsonb_array_elements_text(p_shared->'alerts')), '{}') end else t.alerts end
    where t.series_id = p_series_id and t.deleted_at is null;
  end if;
end;
$$;

notify pgrst, 'reload schema';
