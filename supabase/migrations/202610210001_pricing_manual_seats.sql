-- Pillar Campus Starter plan and server-managed staff seats.
-- Additive migration: existing campus, account, and student rows are preserved.

create or replace function public.pillar_monthly_total(
  p_base_price_inr integer,
  p_additional_seats integer,
  p_additional_seat_price_inr integer
)
returns integer
language sql
immutable
parallel safe
as $$
  select p_base_price_inr + (p_additional_seats * p_additional_seat_price_inr)
$$;

create table if not exists public.campus_subscriptions (
  campus_id uuid primary key references public.campuses(id) on delete cascade,
  plan text not null default 'starter' check (plan = 'starter'),
  base_price_inr integer not null default 499 check (base_price_inr = 499),
  included_staff_seats integer not null default 2 check (included_staff_seats = 2),
  additional_seat_price_inr integer not null default 99 check (additional_seat_price_inr = 99),
  additional_seats integer not null default 0 check (additional_seats between 0 and 1000),
  monthly_total_inr integer generated always as
    (public.pillar_monthly_total(base_price_inr, additional_seats, additional_seat_price_inr)) stored,
  subscription_status text not null default 'active'
    check (subscription_status in ('active','paused','cancelled')),
  billing_cycle text not null default 'monthly' check (billing_cycle = 'monthly'),
  billing_status text not null default 'manual'
    check (billing_status in ('manual','awaiting_payment','paid','overdue')),
  billing_start_date date,
  next_billing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campus_founders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Pillar Campus Founder',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  invited_email text not null,
  display_name text not null,
  phone text not null default '',
  role public.campus_role not null check (role in ('admin','teacher','warden','health_worker','kitchen','bursar')),
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked','failed')),
  invited_user_id uuid references auth.users(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  invited_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(invited_email)) between 3 and 320),
  check (length(trim(display_name)) between 2 and 120),
  check (length(phone) <= 40)
);

-- Membership is unique per auth user across campuses, so an email may reserve
-- only one pending invitation at a time across the whole Pillar Campus system.
drop index if exists public.staff_invitation_one_pending_email_idx;
create unique index if not exists staff_invitation_one_pending_email_idx
  on public.staff_invitations(lower(invited_email)) where status = 'pending';
create index if not exists staff_invitation_campus_expiry_idx
  on public.staff_invitations(campus_id, expires_at) where status = 'pending';

create table if not exists public.subscription_seat_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity between 1 and 100),
  current_approved_quantity integer not null check (current_approved_quantity between 0 and 1000),
  proposed_additional_quantity integer not null check (proposed_additional_quantity between 1 and 1000),
  proposed_monthly_total_inr integer not null check (proposed_monthly_total_inr >= 499),
  reason text not null default '' check (length(reason) <= 1000),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  approved_additional_quantity integer check (approved_additional_quantity between 0 and 1000),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  billing_start_date date,
  director_message text not null default '' check (length(director_message) <= 1000),
  internal_note text not null default '' check (length(internal_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subscription_one_pending_request_idx
  on public.subscription_seat_requests(campus_id) where status = 'pending';
create index if not exists subscription_request_campus_created_idx
  on public.subscription_seat_requests(campus_id, created_at desc);

create table if not exists public.campus_manual_payments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  amount_inr integer not null check (amount_inr between 1 and 10000000),
  payment_date date not null,
  next_billing_date date,
  reference text not null default '' check (length(reference) <= 200),
  note text not null default '' check (length(note) <= 1000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists campus_manual_payments_campus_date_idx
  on public.campus_manual_payments(campus_id, payment_date desc);

create table if not exists public.subscription_audit_log (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(action) between 1 and 80),
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  reason text not null default '' check (length(reason) <= 2000),
  request_id uuid references public.subscription_seat_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists subscription_audit_campus_created_idx
  on public.subscription_audit_log(campus_id, created_at desc);

create or replace function public.pillar_touch_subscription_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists campus_subscriptions_touch_updated_at on public.campus_subscriptions;
create trigger campus_subscriptions_touch_updated_at before update on public.campus_subscriptions
for each row execute function public.pillar_touch_subscription_updated_at();
drop trigger if exists staff_invitations_touch_updated_at on public.staff_invitations;
create trigger staff_invitations_touch_updated_at before update on public.staff_invitations
for each row execute function public.pillar_touch_subscription_updated_at();
drop trigger if exists seat_requests_touch_updated_at on public.subscription_seat_requests;
create trigger seat_requests_touch_updated_at before update on public.subscription_seat_requests
for each row execute function public.pillar_touch_subscription_updated_at();

create or replace function public.pillar_create_campus_subscription()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.campus_subscriptions(campus_id) values (new.id) on conflict (campus_id) do nothing;
  return new;
end $$;
drop trigger if exists campus_subscription_on_create on public.campuses;
create trigger campus_subscription_on_create after insert on public.campuses
for each row execute function public.pillar_create_campus_subscription();

-- Backfill safely. No existing campus or membership rows are changed.
insert into public.campus_subscriptions(campus_id)
select id from public.campuses
on conflict (campus_id) do nothing;

create or replace function public.pillar_director_campus(p_actor_user_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select campus_id from public.campus_members
  where user_id = p_actor_user_id and active and role = 'director'
  limit 1
$$;

create or replace function public.pillar_is_founder(p_actor_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.campus_founders where user_id = p_actor_user_id and active)
$$;

-- One principal Admin/Director account is included. Any further privileged
-- accounts and all other active staff consume staff seats.
create or replace function public.pillar_staff_seats_used(p_campus_id uuid)
returns integer language sql stable security definer set search_path = public
as $$
  select greatest(count(*)::integer - least(count(*) filter (where role in ('director','admin'))::integer, 1), 0)
  from public.campus_members
  where campus_id = p_campus_id and active
$$;

create or replace function public.pillar_require_director(p_actor_user_id uuid)
returns uuid language plpgsql stable security definer set search_path = public
as $$
declare v_campus_id uuid;
begin
  v_campus_id := public.pillar_director_campus(p_actor_user_id);
  if v_campus_id is null then raise exception 'director_required' using errcode = '42501'; end if;
  return v_campus_id;
end $$;

create or replace function public.pillar_require_founder(p_actor_user_id uuid)
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.pillar_is_founder(p_actor_user_id) then raise exception 'founder_required' using errcode = '42501'; end if;
end $$;

create or replace function public.reserve_staff_invitation(
  p_actor_user_id uuid,
  p_email text,
  p_display_name text,
  p_phone text,
  p_role public.campus_role
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_campus_id uuid;
  v_sub public.campus_subscriptions%rowtype;
  v_used integer;
  v_reserved integer;
  v_invitation_id uuid;
  v_email text;
begin
  v_campus_id := public.pillar_require_director(p_actor_user_id);
  if p_role not in ('admin','teacher','warden','health_worker','kitchen','bursar') then
    raise exception 'invalid_staff_role';
  end if;
  v_email := lower(trim(coalesce(p_email,'')));
  if length(v_email) < 3 or length(v_email) > 320 or position('@' in v_email) < 2 then raise exception 'invalid_email'; end if;
  if length(trim(coalesce(p_display_name,''))) < 2 or length(p_display_name) > 120 then raise exception 'invalid_display_name'; end if;
  if length(coalesce(p_phone,'')) > 40 then raise exception 'invalid_phone'; end if;

  select * into v_sub from public.campus_subscriptions where campus_id = v_campus_id for update;
  if not found then raise exception 'subscription_not_configured'; end if;
  update public.staff_invitations set status = 'expired'
  where status = 'pending' and expires_at <= now();
  if exists (
    select 1 from public.campus_members m join auth.users u on u.id=m.user_id
    where lower(u.email)=v_email and m.active
  ) then raise exception 'staff_account_already_linked'; end if;
  if exists(select 1 from public.staff_invitations where campus_id=v_campus_id and lower(invited_email)=v_email and status='pending') then
    raise exception 'invitation_already_pending';
  end if;
  v_used := public.pillar_staff_seats_used(v_campus_id);
  select count(*)::integer into v_reserved from public.staff_invitations
    where campus_id=v_campus_id and status='pending' and expires_at>now();
  if v_used + v_reserved >= v_sub.included_staff_seats + v_sub.additional_seats then raise exception 'seat_limit_reached'; end if;

  insert into public.staff_invitations(campus_id,invited_email,display_name,phone,role,requested_by,expires_at)
  values(v_campus_id,v_email,trim(p_display_name),coalesce(p_phone,''),p_role,p_actor_user_id,now()+interval '1 hour')
  returning id into v_invitation_id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,new_state,reason)
  values(v_campus_id,p_actor_user_id,'staff_invitation_reserved',jsonb_build_object('invitation_id',v_invitation_id,'email',v_email,'role',p_role,'expires_at',now()+interval '1 hour'),'Invitation reserved a staff seat');
  return jsonb_build_object('invitation_id',v_invitation_id,'campus_id',v_campus_id,'used',v_used,'reserved',v_reserved+1,'allowance',v_sub.included_staff_seats+v_sub.additional_seats);
end $$;

create or replace function public.finish_staff_invitation(p_actor_user_id uuid,p_invitation_id uuid,p_auth_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_campus_id uuid;
begin
  v_campus_id := public.pillar_require_director(p_actor_user_id);
  perform 1 from public.campus_subscriptions where campus_id=v_campus_id for update;
  update public.staff_invitations set invited_user_id=p_auth_user_id, invited_at=now()
  where id=p_invitation_id and campus_id=v_campus_id and status='pending' and expires_at>now();
  if not found then raise exception 'invitation_reservation_expired'; end if;
end $$;

create or replace function public.fail_staff_invitation(p_actor_user_id uuid,p_invitation_id uuid,p_reason text default 'Email invitation failed')
returns void language plpgsql security definer set search_path = public
as $$
declare v_campus_id uuid; v_row public.staff_invitations%rowtype;
begin
  v_campus_id := public.pillar_require_director(p_actor_user_id);
  perform 1 from public.campus_subscriptions where campus_id=v_campus_id for update;
  update public.staff_invitations set status='failed'
  where id=p_invitation_id and campus_id=v_campus_id and status='pending' returning * into v_row;
  if found then
    insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason)
    values(v_campus_id,p_actor_user_id,'staff_invitation_failed',jsonb_build_object('invitation_id',v_row.id,'email',v_row.invited_email),jsonb_build_object('status','failed'),left(coalesce(p_reason,''),2000));
  end if;
end $$;

create or replace function public.revoke_staff_invitation(p_actor_user_id uuid,p_invitation_id uuid,p_reason text default 'Cancelled by director')
returns void language plpgsql security definer set search_path = public
as $$
declare v_campus_id uuid; v_row public.staff_invitations%rowtype;
begin
  v_campus_id := public.pillar_require_director(p_actor_user_id);
  perform 1 from public.campus_subscriptions where campus_id=v_campus_id for update;
  select * into v_row from public.staff_invitations where id=p_invitation_id and campus_id=v_campus_id for update;
  if not found or v_row.status <> 'pending' then raise exception 'pending_invitation_not_found'; end if;
  update public.staff_invitations set status='revoked' where id=p_invitation_id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason)
  values(v_campus_id,p_actor_user_id,'staff_invitation_revoked',jsonb_build_object('invitation_id',v_row.id,'email',v_row.invited_email),jsonb_build_object('status','revoked'),left(coalesce(p_reason,''),2000));
end $$;

create or replace function public.expire_staff_invitations()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  update public.staff_invitations set status='expired'
  where status='pending' and expires_at<=now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.accept_staff_invitation(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_campus_id uuid;
  v_inv public.staff_invitations%rowtype;
  v_existing public.campus_members%rowtype;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then raise exception 'authenticated_email_required' using errcode='42501'; end if;
  select * into v_existing from public.campus_members where user_id=p_user_id and active;
  if found then return jsonb_build_object('accepted',false,'already_linked',true); end if;
  select campus_id into v_campus_id from public.staff_invitations
  where lower(invited_email)=v_email and status='pending' and expires_at>now()
    and (invited_user_id is null or invited_user_id=p_user_id)
  order by created_at desc limit 1;
  if v_campus_id is null then return jsonb_build_object('accepted',false); end if;
  perform 1 from public.campus_subscriptions where campus_id=v_campus_id for update;
  select * into v_inv from public.staff_invitations
  where campus_id=v_campus_id and lower(invited_email)=v_email and status='pending' and expires_at>now()
    and (invited_user_id is null or invited_user_id=p_user_id)
  order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('accepted',false); end if;
  select * into v_existing from public.campus_members where user_id=p_user_id for update;
  if found then
    if v_existing.campus_id <> v_campus_id then raise exception 'staff_account_already_linked'; end if;
    update public.campus_members set display_name=v_inv.display_name,phone=v_inv.phone,role=v_inv.role,active=true where id=v_existing.id;
  else
    insert into public.campus_members(user_id,campus_id,display_name,phone,role,active)
    values(p_user_id,v_campus_id,v_inv.display_name,v_inv.phone,v_inv.role,true);
  end if;
  update public.staff_invitations set status='accepted',invited_user_id=p_user_id,accepted_at=now() where id=v_inv.id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason)
  values(v_campus_id,p_user_id,'staff_invitation_accepted',jsonb_build_object('invitation_id',v_inv.id,'email',v_email,'status','pending'),jsonb_build_object('invitation_id',v_inv.id,'role',v_inv.role,'status','accepted'),'Invitation accepted; reserved seat converted to active membership');
  return jsonb_build_object('accepted',true,'campus_id',v_campus_id,'role',v_inv.role);
end $$;

create or replace function public.submit_seat_request(p_actor_user_id uuid,p_requested_quantity integer,p_reason text default '')
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_campus_id uuid; v_sub public.campus_subscriptions%rowtype; v_id uuid;
begin
  v_campus_id := public.pillar_require_director(p_actor_user_id);
  if p_requested_quantity is null or p_requested_quantity not between 1 and 100 then raise exception 'invalid_requested_quantity'; end if;
  if length(coalesce(p_reason,''))>1000 then raise exception 'reason_too_long'; end if;
  select * into v_sub from public.campus_subscriptions where campus_id=v_campus_id for update;
  if not found then raise exception 'subscription_not_configured'; end if;
  if v_sub.additional_seats + p_requested_quantity > 1000 then raise exception 'invalid_requested_quantity'; end if;
  if exists(select 1 from public.subscription_seat_requests where campus_id=v_campus_id and status='pending') then raise exception 'request_already_pending'; end if;
  insert into public.subscription_seat_requests(campus_id,requested_by,requested_quantity,current_approved_quantity,proposed_additional_quantity,proposed_monthly_total_inr,reason)
  values(v_campus_id,p_actor_user_id,p_requested_quantity,v_sub.additional_seats,v_sub.additional_seats+p_requested_quantity,public.pillar_monthly_total(v_sub.base_price_inr,v_sub.additional_seats+p_requested_quantity,v_sub.additional_seat_price_inr),left(coalesce(trim(p_reason),''),1000))
  returning id into v_id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason,request_id)
  values(v_campus_id,p_actor_user_id,'seat_request_submitted',jsonb_build_object('additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr),jsonb_build_object('requested_quantity',p_requested_quantity,'proposed_additional_quantity',v_sub.additional_seats+p_requested_quantity,'proposed_monthly_total_inr',public.pillar_monthly_total(v_sub.base_price_inr,v_sub.additional_seats+p_requested_quantity,v_sub.additional_seat_price_inr),'status','pending'),left(coalesce(trim(p_reason),''),1000),v_id);
  return v_id;
end $$;

create or replace function public.cancel_seat_request(p_actor_user_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_campus_id uuid; v_req public.subscription_seat_requests%rowtype;
begin
  v_campus_id := public.pillar_require_director(p_actor_user_id);
  select * into v_req from public.subscription_seat_requests where id=p_request_id and campus_id=v_campus_id for update;
  if not found or v_req.status<>'pending' then raise exception 'pending_request_not_found'; end if;
  update public.subscription_seat_requests set status='cancelled' where id=v_req.id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason,request_id)
  values(v_campus_id,p_actor_user_id,'seat_request_cancelled',jsonb_build_object('status','pending'),jsonb_build_object('status','cancelled'),'Cancelled by director',v_req.id);
end $$;

create or replace function public.resolve_seat_request(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_decision text,
  p_approved_additional_quantity integer default null,
  p_billing_start_date date default null,
  p_director_message text default '',
  p_internal_note text default ''
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_req public.subscription_seat_requests%rowtype;
  v_sub public.campus_subscriptions%rowtype;
  v_used integer;
  v_reserved integer;
  v_previous jsonb;
begin
  perform public.pillar_require_founder(p_actor_user_id);
  if p_decision not in ('approved','rejected') then raise exception 'invalid_request_decision'; end if;
  if length(coalesce(p_director_message,''))>1000 or length(coalesce(p_internal_note,''))>2000 then raise exception 'note_too_long'; end if;
  select * into v_req from public.subscription_seat_requests where id=p_request_id for update;
  if not found or v_req.status<>'pending' then raise exception 'pending_request_not_found'; end if;
  select * into v_sub from public.campus_subscriptions where campus_id=v_req.campus_id for update;
  if not found then raise exception 'subscription_not_configured'; end if;
  v_previous := jsonb_build_object('additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr,'billing_start_date',v_sub.billing_start_date);
  if p_decision='approved' then
    if p_approved_additional_quantity is null or p_approved_additional_quantity not between 0 and 1000 then raise exception 'invalid_approved_quantity'; end if;
    if p_approved_additional_quantity <= v_sub.additional_seats then raise exception 'approved_quantity_must_increase'; end if;
    if p_billing_start_date is null then raise exception 'billing_start_date_required'; end if;
    update public.staff_invitations set status='expired' where campus_id=v_req.campus_id and status='pending' and expires_at<=now();
    v_used := public.pillar_staff_seats_used(v_req.campus_id);
    select count(*)::integer into v_reserved from public.staff_invitations where campus_id=v_req.campus_id and status='pending' and expires_at>now();
    if v_used+v_reserved > v_sub.included_staff_seats+p_approved_additional_quantity then raise exception 'approved_limit_below_usage'; end if;
    update public.campus_subscriptions set additional_seats=p_approved_additional_quantity,billing_start_date=p_billing_start_date where campus_id=v_req.campus_id returning * into v_sub;
    update public.subscription_seat_requests set status='approved',approved_additional_quantity=p_approved_additional_quantity,resolved_by=p_actor_user_id,resolved_at=now(),billing_start_date=p_billing_start_date,director_message=left(coalesce(p_director_message,''),1000),internal_note=left(coalesce(p_internal_note,''),2000) where id=v_req.id;
  else
    update public.subscription_seat_requests set status='rejected',resolved_by=p_actor_user_id,resolved_at=now(),director_message=left(coalesce(p_director_message,''),1000),internal_note=left(coalesce(p_internal_note,''),2000) where id=v_req.id;
  end if;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason,request_id)
  values(v_req.campus_id,p_actor_user_id,'seat_request_'||p_decision,v_previous,jsonb_build_object('status',p_decision,'additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr,'billing_start_date',v_sub.billing_start_date,'internal_note',left(coalesce(p_internal_note,''),2000)),left(coalesce(p_director_message,p_internal_note,''),2000),v_req.id);
  return jsonb_build_object('request_id',v_req.id,'status',p_decision,'additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr,'billing_start_date',v_sub.billing_start_date);
end $$;

create or replace function public.adjust_subscription_seats(p_actor_user_id uuid,p_campus_id uuid,p_additional_seats integer,p_effective_date date,p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_sub public.campus_subscriptions%rowtype; v_used integer; v_reserved integer; v_previous jsonb;
begin
  perform public.pillar_require_founder(p_actor_user_id);
  if p_additional_seats is null or p_additional_seats not between 0 and 1000 then raise exception 'invalid_approved_quantity'; end if;
  if p_effective_date is null then raise exception 'effective_date_required'; end if;
  if length(coalesce(p_reason,''))<1 or length(p_reason)>2000 then raise exception 'reason_required'; end if;
  select * into v_sub from public.campus_subscriptions where campus_id=p_campus_id for update;
  if not found then raise exception 'subscription_not_configured'; end if;
  update public.staff_invitations set status='expired' where campus_id=p_campus_id and status='pending' and expires_at<=now();
  v_used:=public.pillar_staff_seats_used(p_campus_id);
  select count(*)::integer into v_reserved from public.staff_invitations where campus_id=p_campus_id and status='pending' and expires_at>now();
  if v_used+v_reserved > v_sub.included_staff_seats+p_additional_seats then raise exception 'approved_limit_below_usage'; end if;
  v_previous:=jsonb_build_object('additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr,'billing_start_date',v_sub.billing_start_date);
  update public.campus_subscriptions set additional_seats=p_additional_seats,billing_start_date=p_effective_date where campus_id=p_campus_id returning * into v_sub;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason)
  values(p_campus_id,p_actor_user_id,'seat_limit_manually_adjusted',v_previous,jsonb_build_object('additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr,'billing_start_date',v_sub.billing_start_date),left(p_reason,2000));
  return jsonb_build_object('campus_id',p_campus_id,'additional_seats',v_sub.additional_seats,'monthly_total_inr',v_sub.monthly_total_inr,'billing_start_date',v_sub.billing_start_date);
end $$;

create or replace function public.record_manual_subscription_payment(p_actor_user_id uuid,p_campus_id uuid,p_amount_inr integer,p_payment_date date,p_next_billing_date date,p_reference text default '',p_note text default '')
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_sub public.campus_subscriptions%rowtype; v_payment_id uuid;
begin
  perform public.pillar_require_founder(p_actor_user_id);
  if p_amount_inr is null or p_amount_inr not between 1 and 10000000 then raise exception 'invalid_payment_amount'; end if;
  if p_payment_date is null or length(coalesce(p_reference,''))>200 or length(coalesce(p_note,''))>1000 then raise exception 'invalid_payment_details'; end if;
  select * into v_sub from public.campus_subscriptions where campus_id=p_campus_id for update;
  if not found then raise exception 'subscription_not_configured'; end if;
  insert into public.campus_manual_payments(campus_id,amount_inr,payment_date,next_billing_date,reference,note,recorded_by)
  values(p_campus_id,p_amount_inr,p_payment_date,p_next_billing_date,left(coalesce(p_reference,''),200),left(coalesce(p_note,''),1000),p_actor_user_id)
  returning id into v_payment_id;
  update public.campus_subscriptions set billing_status=case when p_amount_inr>=v_sub.monthly_total_inr then 'paid' else 'awaiting_payment' end,next_billing_date=coalesce(p_next_billing_date,next_billing_date) where campus_id=p_campus_id;
  insert into public.subscription_audit_log(campus_id,actor_user_id,action,previous_state,new_state,reason)
  values(p_campus_id,p_actor_user_id,'manual_payment_recorded',jsonb_build_object('billing_status',v_sub.billing_status,'amount_due_inr',v_sub.monthly_total_inr),jsonb_build_object('payment_id',v_payment_id,'amount_inr',p_amount_inr,'payment_date',p_payment_date,'billing_status',case when p_amount_inr>=v_sub.monthly_total_inr then 'paid' else 'awaiting_payment' end,'next_billing_date',p_next_billing_date),left(coalesce(p_note,p_reference,''),1000));
  return v_payment_id;
end $$;

-- Private billing records are accessed only by the signed-in Edge Function.
alter table public.campus_subscriptions enable row level security;
alter table public.campus_founders enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.subscription_seat_requests enable row level security;
alter table public.campus_manual_payments enable row level security;
alter table public.subscription_audit_log enable row level security;
drop policy if exists campus_subscription_director_read on public.campus_subscriptions;
create policy campus_subscription_director_read on public.campus_subscriptions
for select to authenticated using (campus_id=public.my_campus_id() and public.my_campus_role()='director');
drop policy if exists staff_invitation_director_read on public.staff_invitations;
create policy staff_invitation_director_read on public.staff_invitations
for select to authenticated using (campus_id=public.my_campus_id() and public.my_campus_role()='director');
drop policy if exists seat_request_director_read on public.subscription_seat_requests;
create policy seat_request_director_read on public.subscription_seat_requests
for select to authenticated using (campus_id=public.my_campus_id() and public.my_campus_role()='director');

revoke all on public.campus_founders, public.campus_manual_payments, public.subscription_audit_log from anon, authenticated;
revoke insert, update, delete on public.campus_subscriptions, public.staff_invitations, public.subscription_seat_requests from anon, authenticated;
-- Request rows contain founder-only internal notes. Directors read their
-- filtered request view through director_summary instead of selecting rows.
revoke select on public.subscription_seat_requests from anon, authenticated;
grant select on public.campus_subscriptions, public.staff_invitations to authenticated;
grant all on public.campus_founders, public.campus_subscriptions, public.staff_invitations,
  public.subscription_seat_requests, public.campus_manual_payments, public.subscription_audit_log to service_role;
grant usage on schema public to service_role;
grant select on public.campuses to service_role;
grant select, insert, update on public.campus_members to service_role;

-- All mutating RPCs are service-role only. The Edge Function authenticates the
-- caller and each function independently checks director/founder authority.
revoke all on function public.pillar_director_campus(uuid) from public, anon, authenticated;
revoke all on function public.pillar_is_founder(uuid) from public, anon, authenticated;
revoke all on function public.pillar_staff_seats_used(uuid) from public, anon, authenticated;
revoke all on function public.pillar_require_director(uuid) from public, anon, authenticated;
revoke all on function public.pillar_require_founder(uuid) from public, anon, authenticated;
revoke all on function public.reserve_staff_invitation(uuid,text,text,text,public.campus_role) from public, anon, authenticated;
revoke all on function public.finish_staff_invitation(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.fail_staff_invitation(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.revoke_staff_invitation(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.expire_staff_invitations() from public, anon, authenticated;
revoke all on function public.accept_staff_invitation(uuid) from public, anon, authenticated;
revoke all on function public.submit_seat_request(uuid,integer,text) from public, anon, authenticated;
revoke all on function public.cancel_seat_request(uuid,uuid) from public, anon, authenticated;
revoke all on function public.resolve_seat_request(uuid,uuid,text,integer,date,text,text) from public, anon, authenticated;
revoke all on function public.adjust_subscription_seats(uuid,uuid,integer,date,text) from public, anon, authenticated;
revoke all on function public.record_manual_subscription_payment(uuid,uuid,integer,date,date,text,text) from public, anon, authenticated;
grant execute on function public.pillar_monthly_total(integer,integer,integer) to authenticated, service_role;
grant execute on function public.reserve_staff_invitation(uuid,text,text,text,public.campus_role),
  public.finish_staff_invitation(uuid,uuid,uuid), public.fail_staff_invitation(uuid,uuid,text),
  public.revoke_staff_invitation(uuid,uuid,text), public.expire_staff_invitations(),
  public.accept_staff_invitation(uuid), public.submit_seat_request(uuid,integer,text),
  public.cancel_seat_request(uuid,uuid), public.resolve_seat_request(uuid,uuid,text,integer,date,text,text),
  public.adjust_subscription_seats(uuid,uuid,integer,date,text),
  public.record_manual_subscription_payment(uuid,uuid,integer,date,date,text,text) to service_role;
