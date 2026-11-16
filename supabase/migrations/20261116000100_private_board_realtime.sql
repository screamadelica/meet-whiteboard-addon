create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.board_sessions (
  id uuid primary key default gen_random_uuid(),
  channel_name text not null unique,
  owner_invite_hash text not null,
  participant_invite_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.board_memberships (
  board_id uuid not null references public.board_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'participant')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

alter table public.board_sessions enable row level security;
alter table public.board_memberships enable row level security;

revoke all on public.board_sessions, public.board_memberships from anon, authenticated;
grant all on public.board_sessions, public.board_memberships to service_role;

create or replace function private.is_realtime_board_member(p_channel_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_memberships as membership
    join public.board_sessions as board on board.id = membership.board_id
    where membership.user_id = (select auth.uid())
      and board.channel_name = p_channel_name
      and board.expires_at > now()
  );
$$;

revoke all on function private.is_realtime_board_member(text) from public, anon;
grant execute on function private.is_realtime_board_member(text) to authenticated;

drop policy if exists "Board members can receive private broadcasts" on realtime.messages;
create policy "Board members can receive private broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select private.is_realtime_board_member((select realtime.topic())))
  );

drop policy if exists "Board members can send private broadcasts" on realtime.messages;
create policy "Board members can send private broadcasts"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'broadcast'
    and (select private.is_realtime_board_member((select realtime.topic())))
  );