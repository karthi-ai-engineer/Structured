-- Phase 3, WP4: an empty alert list means "no alerts" and must stay empty. In 0006,
-- update_series turned [] into null ("use the defaults"); this version keeps [] as {} and only
-- a JSON null clears the list.

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
      alerts       = case when p_shared ? 'alerts' then case when jsonb_typeof(p_shared->'alerts') = 'array' then coalesce((select array_agg(value::int) from jsonb_array_elements_text(p_shared->'alerts')), '{}') end else t.alerts end
    where t.series_id = p_series_id and t.deleted_at is null;
  end if;
end;
$$;

notify pgrst, 'reload schema';
