-- 0002: MCP batches (PLAN.md section 10.3/10.4): every write Claude makes through the MCP server
-- is recorded as one batch with the operations it performed and, for edits, the values before the
-- edit, so `undo_batch` can revert exactly that batch. Tasks written by Claude also carry the
-- batch id (tasks.batch_id, from 0001).
--
-- New-table checklist (CLAUDE.md): grants, RLS, open_access policy (until SSO), updated_at with
-- trigger, no realtime (the UI never reads batches), schema reload.

create table public.mcp_batches (
  id          uuid primary key,
  tool        text not null check (length(tool) between 1 and 64),
  summary     text,
  -- [{ "kind": "create" | "update" | "delete", "id": "<task uuid>", "before": { ... } }]
  ops         jsonb not null default '[]' check (jsonb_typeof(ops) = 'array'),
  undone_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index mcp_batches_created_idx on public.mcp_batches (created_at desc);

grant select, insert, update, delete on table public.mcp_batches to anon, authenticated, service_role;

alter table public.mcp_batches enable row level security;
create policy "open_access" on public.mcp_batches for all to anon, authenticated using (true) with check (true);

create trigger mcp_batches_touch before update on public.mcp_batches
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
