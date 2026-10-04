-- AssetFlow stores its full application state as one JSONB document.
-- This table must only be accessed by the trusted Node API using its
-- server-side Supabase secret/service_role key. Never put that key in Angular.
create table if not exists public.assetflow_state (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.assetflow_state enable row level security;
revoke all on table public.assetflow_state from anon, authenticated;
grant all on table public.assetflow_state to service_role;
