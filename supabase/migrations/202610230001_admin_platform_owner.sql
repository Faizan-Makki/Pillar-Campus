-- Replace institute Director access with Admin and separate the global
-- platform owner allowlist. This migration is additive and preserves records.
begin;

create table if not exists public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pillar Campus Platform Owner',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.platform_owners enable row level security;
revoke all on public.platform_owners from anon, authenticated;
grant all on public.platform_owners to service_role;

create table if not exists public.campus_role_migration_backup_20261023 (
  user_id uuid not null,
  campus_id uuid not null,
  old_role text not null check (old_role = 'director'),
  changed_at timestamptz not null default now(),
  primary key (user_id, campus_id)
);
alter table public.campus_role_migration_backup_20261023 enable row level security;
revoke all on public.campus_role_migration_backup_20261023 from anon, authenticated;
grant all on public.campus_role_migration_backup_20261023 to service_role;

-- Preserve the currently configured owner user IDs and active state. The old
-- table remains in place for rollback; conflicts keep the existing owner row.
insert into public.platform_owners(user_id, display_name, active, created_at)
select user_id, display_name, active, created_at from public.campus_founders
on conflict (user_id) do nothing;

-- A campus must not end up with two active institute Admins. Stop for review
-- instead of silently choosing which old Director or Admin should remain.
do $$
begin
  if exists (
    select 1 from public.campus_members
    where active and role in ('director','admin')
    group by campus_id having count(*) > 1
  ) then
    raise exception 'admin_role_migration_conflict: a campus has more than one active director/admin; resolve memberships before retrying';
  end if;
end $$;

insert into public.campus_role_migration_backup_20261023(user_id,campus_id,old_role)
select user_id,campus_id,role::text from public.campus_members where role='director'
on conflict (user_id,campus_id) do nothing;
update public.campus_members set role = 'admin' where role = 'director';

-- Enforce the single institute Admin rule for future SQL and service writes too.
-- The preflight above ensures this index can be created without picking a winner.
create unique index if not exists campus_members_one_active_admin_idx
  on public.campus_members(campus_id) where active and role = 'admin';

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.campus_members'::regclass and conname='campus_members_role_no_director_check') then
    alter table public.campus_members add constraint campus_members_role_no_director_check check (role <> 'director') not valid;
  end if;
end $$;
alter table public.campus_members validate constraint campus_members_role_no_director_check;

-- Rebuild the data policies in place so Admin permissions and campus scoping
-- match the current schema instead of leaving Director in old policy arrays.
drop policy if exists students_add_staff on public.students;
create policy students_add_staff on public.students for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher']::public.campus_role[]));
drop policy if exists students_edit_staff on public.students;
create policy students_edit_staff on public.students for update to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());
drop policy if exists students_remove_admin on public.students;
create policy students_remove_admin on public.students for delete to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists attendance_add_staff on public.attendance;
create policy attendance_add_staff on public.attendance for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher','warden']::public.campus_role[]));
drop policy if exists attendance_edit_staff on public.attendance;
create policy attendance_edit_staff on public.attendance for update to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher','warden']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());

drop policy if exists leave_add_warden on public.leave_records;
create policy leave_add_warden on public.leave_records for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','warden']::public.campus_role[]));
drop policy if exists leave_edit_warden on public.leave_records;
create policy leave_edit_warden on public.leave_records for update to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','warden']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());

drop policy if exists health_read_authorised on public.health_records;
create policy health_read_authorised on public.health_records for select to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','health_worker']::public.campus_role[]));
drop policy if exists health_add_authorised on public.health_records;
create policy health_add_authorised on public.health_records for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','health_worker']::public.campus_role[]));
drop policy if exists health_edit_authorised on public.health_records;
create policy health_edit_authorised on public.health_records for update to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','health_worker']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());

drop policy if exists inventory_add_kitchen on public.inventory_items;
create policy inventory_add_kitchen on public.inventory_items for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','kitchen']::public.campus_role[]));
drop policy if exists inventory_edit_kitchen on public.inventory_items;
create policy inventory_edit_kitchen on public.inventory_items for update to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','kitchen']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());
drop policy if exists stock_add_kitchen on public.stock_transactions;
create policy stock_add_kitchen on public.stock_transactions for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','kitchen']::public.campus_role[]));
drop policy if exists meals_manage_kitchen on public.meal_plans;
create policy meals_manage_kitchen on public.meal_plans for all to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','kitchen']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());
drop policy if exists papers_manage_teacher on public.exam_papers;
create policy papers_manage_teacher on public.exam_papers for all to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher']::public.campus_role[]))
  with check (campus_id = public.my_campus_id());
drop policy if exists fees_read_authorised on public.fee_payments;
create policy fees_read_authorised on public.fee_payments for select to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','bursar']::public.campus_role[]));
drop policy if exists fees_add_authorised on public.fee_payments;
create policy fees_add_authorised on public.fee_payments for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','bursar']::public.campus_role[]));

create or replace function public.adjust_inventory_stock(
  p_item_id uuid, p_quantity_change numeric, p_supplier text default '',
  p_amount_paid numeric default 0, p_note text default ''
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_campus_role(array['admin','kitchen']::public.campus_role[]) then
    raise exception 'Not permitted to change kitchen stock' using errcode = '42501';
  end if;
  update public.inventory_items
  set quantity = quantity + p_quantity_change, updated_at = now()
  where id = p_item_id and campus_id = public.my_campus_id();
  if not found then raise exception 'Kitchen item not found for this campus'; end if;
  insert into public.stock_transactions (campus_id,item_id,quantity_change,supplier,amount_paid,note,recorded_by)
  select public.my_campus_id(), p_item_id, p_quantity_change, coalesce(p_supplier,''), coalesce(p_amount_paid,0), coalesce(p_note,''), id
  from public.campus_members where user_id = auth.uid() and active;
end;
$$;

create or replace function public.pillar_admin_campus(p_actor_user_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select campus_id from public.campus_members
  where user_id = p_actor_user_id and active and role = 'admin'
  limit 1
$$;

create or replace function public.pillar_require_admin(p_actor_user_id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare v_campus_id uuid;
begin
  v_campus_id := public.pillar_admin_campus(p_actor_user_id);
  if v_campus_id is null then raise exception 'admin_required' using errcode = '42501'; end if;
  return v_campus_id;
end $$;

create or replace function public.pillar_is_platform_owner(p_actor_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.platform_owners where user_id = p_actor_user_id and active)
$$;

create or replace function public.pillar_require_platform_owner(p_actor_user_id uuid)
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.pillar_is_platform_owner(p_actor_user_id) then
    raise exception 'platform_owner_required' using errcode = '42501';
  end if;
end $$;

-- Existing service-only RPCs call these names. Keep them as compatibility
-- wrappers, but make their check enforce Admin membership from now on.
create or replace function public.pillar_director_campus(p_actor_user_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select public.pillar_admin_campus(p_actor_user_id) $$;

create or replace function public.pillar_require_director(p_actor_user_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select public.pillar_require_admin(p_actor_user_id) $$;

create or replace function public.pillar_require_founder(p_actor_user_id uuid)
returns void language sql stable security definer set search_path = public
as $$ select public.pillar_require_platform_owner(p_actor_user_id) $$;

create or replace function public.pillar_staff_seats_used(p_campus_id uuid)
returns integer language sql stable security definer set search_path = public
as $$
  select greatest(count(*)::integer - least(count(*) filter (where role = 'admin')::integer, 1), 0)
  from public.campus_members where campus_id = p_campus_id and active
$$;

-- The invite RPC remains the only path to create staff membership. An Admin
-- may invite job roles, but cannot create another institute Admin account.
create or replace function public.reserve_staff_invitation(
  p_actor_user_id uuid, p_email text, p_display_name text, p_phone text, p_role public.campus_role
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_campus_id uuid; v_sub public.campus_subscriptions%rowtype; v_used integer;
  v_reserved integer; v_invitation_id uuid; v_email text;
begin
  v_campus_id := public.pillar_require_admin(p_actor_user_id);
  if p_role not in ('teacher','warden','health_worker','kitchen','bursar') then raise exception 'invalid_staff_role'; end if;
  v_email := lower(trim(coalesce(p_email,'')));
  if length(v_email) < 3 or length(v_email) > 320 or position('@' in v_email) < 2 then raise exception 'invalid_email'; end if;
  if length(trim(coalesce(p_display_name,''))) < 2 or length(p_display_name) > 120 then raise exception 'invalid_display_name'; end if;
  if length(coalesce(p_phone,'')) > 40 then raise exception 'invalid_phone'; end if;
  select * into v_sub from public.campus_subscriptions where campus_id=v_campus_id for update;
  if not found then raise exception 'subscription_not_configured'; end if;
  update public.staff_invitations set status='expired' where status='pending' and expires_at<=now();
  if exists(select 1 from public.campus_members m join auth.users u on u.id=m.user_id where lower(u.email)=v_email and m.active) then raise exception 'staff_account_already_linked'; end if;
  if exists(select 1 from public.staff_invitations where campus_id=v_campus_id and lower(invited_email)=v_email and status='pending') then raise exception 'invitation_already_pending'; end if;
  v_used := public.pillar_staff_seats_used(v_campus_id);
  select count(*)::integer into v_reserved from public.staff_invitations where campus_id=v_campus_id and status='pending' and expires_at>now();
  if v_used + v_reserved >= v_sub.included_staff_seats + v_sub.additional_seats then raise exception 'seat_limit_reached'; end if;
  insert into public.staff_invitations(campus_id,invited_email,display_name,phone,role,requested_by,expires_at)
    values(v_campus_id,v_email,trim(p_display_name),coalesce(p_phone,''),p_role,p_actor_user_id,now()+interval '1 hour') returning id into v_invitation_id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,new_state,reason)
    values(v_campus_id,p_actor_user_id,'staff_invitation_reserved',jsonb_build_object('invitation_id',v_invitation_id,'email',v_email,'role',p_role,'expires_at',now()+interval '1 hour'),'Invitation reserved a Staff seat');
  return jsonb_build_object('invitation_id',v_invitation_id,'campus_id',v_campus_id,'used',v_used,'reserved',v_reserved+1,'allowance',v_sub.included_staff_seats+v_sub.additional_seats);
end $$;

drop policy if exists campus_subscription_director_read on public.campus_subscriptions;
drop policy if exists staff_invitation_director_read on public.staff_invitations;
drop policy if exists seat_request_director_read on public.subscription_seat_requests;
drop policy if exists campus_subscription_admin_read on public.campus_subscriptions;
create policy campus_subscription_admin_read on public.campus_subscriptions
for select to authenticated using (campus_id=public.my_campus_id() and public.my_campus_role()='admin');
drop policy if exists staff_invitation_admin_read on public.staff_invitations;
create policy staff_invitation_admin_read on public.staff_invitations
for select to authenticated using (campus_id=public.my_campus_id() and public.my_campus_role()='admin');

revoke all on function public.pillar_admin_campus(uuid) from public, anon, authenticated;
revoke all on function public.pillar_require_admin(uuid) from public, anon, authenticated;
revoke all on function public.pillar_is_platform_owner(uuid) from public, anon, authenticated;
revoke all on function public.pillar_require_platform_owner(uuid) from public, anon, authenticated;
revoke all on function public.pillar_director_campus(uuid) from public, anon, authenticated;
revoke all on function public.pillar_require_director(uuid) from public, anon, authenticated;
revoke all on function public.pillar_require_founder(uuid) from public, anon, authenticated;
revoke all on function public.pillar_staff_seats_used(uuid) from public, anon, authenticated;
grant execute on function public.pillar_admin_campus(uuid), public.pillar_require_admin(uuid),
  public.pillar_is_platform_owner(uuid), public.pillar_require_platform_owner(uuid),
  public.pillar_director_campus(uuid), public.pillar_require_director(uuid),
  public.pillar_require_founder(uuid), public.pillar_staff_seats_used(uuid) to service_role;

commit;
