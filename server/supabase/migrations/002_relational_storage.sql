-- Move AssetFlow from one whole-app JSONB document to per-entity tables.
-- Run once in the Supabase SQL Editor. The existing assetflow_state row is
-- retained as a rollback snapshot; the new API reads/writes through RPC only.

create table if not exists public.assetflow_meta (
  singleton smallint primary key default 1 check (singleton = 1),
  seq bigint not null default 1000,
  employee_comments jsonb not null default '{}'::jsonb check (jsonb_typeof(employee_comments) = 'object'),
  asset_comment_history_v1 boolean not null default false,
  migration_markers jsonb not null default '{}'::jsonb check (jsonb_typeof(migration_markers) = 'object')
);

create table if not exists public.assetflow_assets (
  record_key text primary key,
  record_id bigint unique,
  position integer not null unique,
  serial text,
  category text,
  status text,
  assigned_to text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists assetflow_assets_serial_idx on public.assetflow_assets(serial);
create index if not exists assetflow_assets_assigned_to_idx on public.assetflow_assets(assigned_to);

create table if not exists public.assetflow_employees (
  record_key text primary key,
  position integer not null unique,
  name text not null check (length(trim(name)) > 0),
  normalized_name text generated always as (lower(trim(name))) stored,
  department text not null default '',
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists assetflow_employees_name_idx on public.assetflow_employees(normalized_name);

create table if not exists public.assetflow_users (
  username text primary key check (length(trim(username)) > 0),
  position integer not null unique,
  role text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.assetflow_logs (
  position integer primary key,
  occurred_at timestamptz,
  actor text,
  action text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists assetflow_logs_occurred_at_idx on public.assetflow_logs(occurred_at desc);

create table if not exists public.assetflow_consumables (
  record_key text primary key,
  record_id bigint unique,
  position integer not null unique,
  name text not null check (length(trim(name)) > 0),
  category text,
  quantity integer not null check (quantity >= 0),
  reorder_threshold integer not null check (reorder_threshold >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.assetflow_desk_peripherals (
  record_key text primary key,
  record_id bigint unique,
  position integer not null unique,
  desk_no text not null,
  category text not null,
  serial text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists assetflow_desk_peripherals_desk_idx on public.assetflow_desk_peripherals(desk_no);

create table if not exists public.assetflow_former_employees (
  record_key text primary key,
  record_id bigint unique,
  position integer not null unique,
  name text not null check (length(trim(name)) > 0),
  department text not null default '',
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.assetflow_dell_cases (
  record_key text primary key,
  record_id bigint unique,
  position integer not null unique,
  case_number text,
  asset_serial text,
  asset_id bigint references public.assetflow_assets(record_id) on delete set null,
  status text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
create index if not exists assetflow_dell_cases_case_number_idx on public.assetflow_dell_cases(case_number);
create index if not exists assetflow_dell_cases_asset_serial_idx on public.assetflow_dell_cases(asset_serial);

create table if not exists public.assetflow_quick_links (
  record_key text primary key,
  record_id text,
  position integer not null unique,
  name text,
  url text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.assetflow_offboarding_checklists (
  record_key text primary key,
  position integer not null unique,
  employee_name text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.assetflow_employee_comments (
  employee_key text primary key,
  payload jsonb not null
);

create table if not exists public.assetflow_migration_archives (
  archive_key text primary key,
  source text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  archived_at timestamptz not null default now()
);

create or replace function public.assetflow_load_state()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'assets', coalesce((select jsonb_agg(payload order by position) from public.assetflow_assets), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(payload order by position) from public.assetflow_employees), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(payload order by position) from public.assetflow_users), '[]'::jsonb),
    'logs', coalesce((select jsonb_agg(payload order by position) from public.assetflow_logs), '[]'::jsonb),
    'consumables', coalesce((select jsonb_agg(payload order by position) from public.assetflow_consumables), '[]'::jsonb),
    'deskPeripherals', coalesce((select jsonb_agg(payload order by position) from public.assetflow_desk_peripherals), '[]'::jsonb),
    'formerEmployees', coalesce((select jsonb_agg(payload order by position) from public.assetflow_former_employees), '[]'::jsonb),
    'dellCases', coalesce((select jsonb_agg(payload order by position) from public.assetflow_dell_cases), '[]'::jsonb),
    'quickLinks', coalesce((select jsonb_agg(payload order by position) from public.assetflow_quick_links), '[]'::jsonb),
    'offboardingChecklists', coalesce((select jsonb_agg(payload order by position) from public.assetflow_offboarding_checklists), '[]'::jsonb),
    'employeeComments', coalesce((select jsonb_object_agg(employee_key, payload) from public.assetflow_employee_comments), '{}'::jsonb),
    'seq', coalesce((select seq from public.assetflow_meta where singleton = 1), 1000),
    'assetCommentHistoryV1', coalesce((select asset_comment_history_v1 from public.assetflow_meta where singleton = 1), false)
  );
$$;

create or replace function public.assetflow_save_state(p_state jsonb, p_local_archive jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'AssetFlow state must be a JSON object';
  end if;

  insert into public.assetflow_meta(singleton, seq, employee_comments, asset_comment_history_v1)
  values (1, coalesce(nullif(p_state->>'seq', '')::bigint, 1000), coalesce(p_state->'employeeComments', '{}'::jsonb), coalesce((p_state->>'assetCommentHistoryV1')::boolean, false))
  on conflict (singleton) do update set
    seq = excluded.seq,
    employee_comments = excluded.employee_comments,
    asset_comment_history_v1 = excluded.asset_comment_history_v1;

  delete from public.assetflow_dell_cases;
  delete from public.assetflow_assets;
  delete from public.assetflow_employees;
  delete from public.assetflow_users;
  delete from public.assetflow_logs;
  delete from public.assetflow_consumables;
  delete from public.assetflow_desk_peripherals;
  delete from public.assetflow_former_employees;
  delete from public.assetflow_quick_links;
  delete from public.assetflow_offboarding_checklists;
  delete from public.assetflow_employee_comments;

  insert into public.assetflow_employees(record_key, position, name, department, payload)
  select coalesce(nullif(e.value->>'name', ''), 'employee-' || e.ordinality::text) || '#' || e.ordinality::text,
         e.ordinality::integer,
         coalesce(nullif(e.value->>'name', ''), 'Employee ' || e.ordinality::text),
         coalesce(e.value->>'department', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'employees', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_assets(record_key, record_id, position, serial, category, status, assigned_to, payload)
  select coalesce(e.value->>'id', e.ordinality::text), nullif(e.value->>'id', '')::bigint,
         e.ordinality::integer, nullif(e.value->>'serial', ''), nullif(e.value->>'category', ''),
         nullif(e.value->>'status', ''), nullif(e.value->>'assignedTo', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'assets', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_users(username, position, role, payload)
  select lower(trim(e.value->>'username')), e.ordinality::integer, nullif(e.value->>'role', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'users', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object' and length(trim(coalesce(e.value->>'username', ''))) > 0;

  insert into public.assetflow_logs(position, occurred_at, actor, action, payload)
  select e.ordinality::integer,
         case when coalesce(e.value->>'timestamp', '') ~ '^\d{4}-\d{2}-\d{2}T' then (e.value->>'timestamp')::timestamptz else null end,
         nullif(e.value->>'user', ''), nullif(e.value->>'action', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'logs', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_consumables(record_key, record_id, position, name, category, quantity, reorder_threshold, payload)
  select coalesce(e.value->>'id', e.ordinality::text), nullif(e.value->>'id', '')::bigint, e.ordinality::integer,
         coalesce(nullif(e.value->>'name', ''), 'Item ' || e.ordinality::text), nullif(e.value->>'category', ''),
         greatest(coalesce(nullif(e.value->>'quantity', '')::integer, 0), 0),
         greatest(coalesce(nullif(e.value->>'reorderThreshold', '')::integer, 0), 0), e.value
  from jsonb_array_elements(coalesce(p_state->'consumables', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_desk_peripherals(record_key, record_id, position, desk_no, category, serial, payload)
  select coalesce(e.value->>'id', e.ordinality::text), nullif(e.value->>'id', '')::bigint, e.ordinality::integer,
         coalesce(e.value->>'deskNo', ''), coalesce(e.value->>'category', ''), coalesce(e.value->>'serial', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'deskPeripherals', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_former_employees(record_key, record_id, position, name, department, payload)
  select coalesce(e.value->>'id', e.ordinality::text), nullif(e.value->>'id', '')::bigint, e.ordinality::integer,
         coalesce(nullif(e.value->>'name', ''), 'Employee ' || e.ordinality::text), coalesce(e.value->>'department', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'formerEmployees', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_dell_cases(record_key, record_id, position, case_number, asset_serial, asset_id, status, payload)
  select coalesce(e.value->>'id', e.ordinality::text), nullif(e.value->>'id', '')::bigint, e.ordinality::integer,
         nullif(e.value->>'caseId', ''), nullif(e.value->>'assetSerial', ''), a.record_id,
         nullif(e.value->>'status', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'dellCases', '[]'::jsonb)) with ordinality e(value, ordinality)
  left join public.assetflow_assets a on a.serial = nullif(e.value->>'assetSerial', '')
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_quick_links(record_key, record_id, position, name, url, payload)
  select coalesce(e.value->>'id', e.ordinality::text), e.value->>'id', e.ordinality::integer,
         nullif(e.value->>'name', ''), nullif(e.value->>'url', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'quickLinks', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_offboarding_checklists(record_key, position, employee_name, payload)
  select coalesce(e.value->>'id', e.value->>'employeeName', e.ordinality::text) || '#' || e.ordinality::text,
         e.ordinality::integer, nullif(e.value->>'employeeName', ''), e.value
  from jsonb_array_elements(coalesce(p_state->'offboardingChecklists', '[]'::jsonb)) with ordinality e(value, ordinality)
  where jsonb_typeof(e.value) = 'object';

  insert into public.assetflow_employee_comments(employee_key, payload)
  select key, value from jsonb_each(coalesce(p_state->'employeeComments', '{}'::jsonb));

  if p_local_archive is not null then
    insert into public.assetflow_migration_archives(archive_key, source, data)
    values ('local-data-json-v1', 'server/data.json', p_local_archive)
    on conflict (archive_key) do update set source = excluded.source, data = excluded.data, archived_at = now();
  end if;

  return jsonb_build_object('ok', true, 'archivedLocalSnapshot', p_local_archive is not null);
end;
$$;

create or replace function public.assetflow_get_local_archive()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$ select data from public.assetflow_migration_archives where archive_key = 'local-data-json-v1'; $$;

alter table public.assetflow_meta enable row level security;
alter table public.assetflow_assets enable row level security;
alter table public.assetflow_employees enable row level security;
alter table public.assetflow_users enable row level security;
alter table public.assetflow_logs enable row level security;
alter table public.assetflow_consumables enable row level security;
alter table public.assetflow_desk_peripherals enable row level security;
alter table public.assetflow_former_employees enable row level security;
alter table public.assetflow_dell_cases enable row level security;
alter table public.assetflow_quick_links enable row level security;
alter table public.assetflow_offboarding_checklists enable row level security;
alter table public.assetflow_employee_comments enable row level security;
alter table public.assetflow_migration_archives enable row level security;

revoke all on public.assetflow_meta, public.assetflow_assets, public.assetflow_employees,
  public.assetflow_users, public.assetflow_logs, public.assetflow_consumables,
  public.assetflow_desk_peripherals, public.assetflow_former_employees,
  public.assetflow_dell_cases, public.assetflow_quick_links,
  public.assetflow_offboarding_checklists, public.assetflow_employee_comments,
  public.assetflow_migration_archives from anon, authenticated;
grant all on public.assetflow_meta, public.assetflow_assets, public.assetflow_employees,
  public.assetflow_users, public.assetflow_logs, public.assetflow_consumables,
  public.assetflow_desk_peripherals, public.assetflow_former_employees,
  public.assetflow_dell_cases, public.assetflow_quick_links,
  public.assetflow_offboarding_checklists, public.assetflow_employee_comments,
  public.assetflow_migration_archives to service_role;
revoke all on function public.assetflow_load_state() from public, anon, authenticated;
revoke all on function public.assetflow_save_state(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.assetflow_get_local_archive() from public, anon, authenticated;
grant execute on function public.assetflow_load_state() to service_role;
grant execute on function public.assetflow_save_state(jsonb, jsonb) to service_role;
grant execute on function public.assetflow_get_local_archive() to service_role;

-- Import the current Supabase JSONB snapshot exactly once. Local data is merged
-- and archived separately by server/migrate-supabase.js after this migration.
do $$
declare
  legacy jsonb;
  local_archive jsonb;
begin
  select data into legacy from public.assetflow_state where id = 'main';
  if legacy is not null and not exists (select 1 from public.assetflow_meta where singleton = 1) then
    local_archive := legacy->'_localSnapshotArchive';
    perform public.assetflow_save_state(legacy - '_localSnapshotArchive', local_archive);
  end if;
end;
$$;
