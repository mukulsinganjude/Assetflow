-- Persist the recovery archive and cross-device change counter when the app
-- uses the relational Supabase store. The entity tables remain unchanged;
-- migration_markers already provides a JSONB place for app-level metadata.

do $$
begin
  if to_regprocedure('public.assetflow_save_state_base(jsonb,jsonb)') is null then
    alter function public.assetflow_save_state(jsonb, jsonb) rename to assetflow_save_state_base;
  end if;
end;
$$;

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
    'deletedRecords', coalesce((select nullif(migration_markers->'deletedRecords', 'null'::jsonb) from public.assetflow_meta where singleton = 1), '[]'::jsonb),
    'changeSequence', coalesce((select nullif(migration_markers->>'changeSequence', '')::bigint from public.assetflow_meta where singleton = 1), 0),
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
declare
  result jsonb;
begin
  result := public.assetflow_save_state_base(p_state, p_local_archive);
  update public.assetflow_meta
  set migration_markers = coalesce(migration_markers, '{}'::jsonb) || jsonb_build_object(
    'deletedRecords', coalesce(p_state->'deletedRecords', '[]'::jsonb),
    'changeSequence', coalesce(p_state->'changeSequence', '0'::jsonb)
  )
  where singleton = 1;
  return result;
end;
$$;

revoke all on function public.assetflow_save_state_base(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.assetflow_load_state() from public, anon, authenticated;
revoke all on function public.assetflow_save_state(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.assetflow_load_state() to service_role;
grant execute on function public.assetflow_save_state(jsonb, jsonb) to service_role;
