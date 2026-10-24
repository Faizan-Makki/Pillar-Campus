-- Pillar Campus pilot schema: one campus, invite-only accounts, tenant-scoped data.
-- Run this complete file in Supabase SQL Editor before adding any real records.

create extension if not exists pgcrypto;

do $$ begin
  -- Keep director only as a legacy enum value so existing deployments can
  -- migrate safely; active memberships must use admin after migration.
  create type public.campus_role as enum ('director','admin','teacher','warden','health_worker','kitchen','bursar');
exception when duplicate_object then null; end $$;

create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.campus_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  display_name text not null,
  phone text not null default '',
  role public.campus_role not null default 'teacher',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus_id, id),
  constraint campus_members_role_no_director_check check (role <> 'director')
);

create or replace function public.my_campus_id()
returns uuid language sql stable security definer set search_path = public
as $$ select campus_id from public.campus_members where user_id = auth.uid() and active limit 1 $$;

create or replace function public.my_campus_role()
returns public.campus_role language sql stable security definer set search_path = public
as $$ select role from public.campus_members where user_id = auth.uid() and active limit 1 $$;

create or replace function public.has_campus_role(allowed public.campus_role[])
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.my_campus_role() = any(allowed), false) $$;

revoke all on function public.my_campus_id() from public;
revoke all on function public.my_campus_role() from public;
revoke all on function public.has_campus_role(public.campus_role[]) from public;
grant execute on function public.my_campus_id() to authenticated;
grant execute on function public.my_campus_role() to authenticated;
grant execute on function public.has_campus_role(public.campus_role[]) to authenticated;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  roll_number text not null,
  full_name text not null,
  class_name text not null default '',
  section text not null default '',
  gender text not null default '',
  residency text not null default 'day',
  room text not null default '',
  guardian_name text not null default '',
  guardian_phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus_id, roll_number)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  shift text not null check (shift in ('Morning','Evening')),
  status text not null check (status in ('Present','Absent','On leave')),
  marked_by uuid references public.campus_members(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (student_id, attendance_date, shift)
);

create table if not exists public.leave_records (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  guardian_name text not null default '',
  guardian_phone text not null default '',
  purpose text not null default '',
  start_date date not null default current_date,
  expected_return date not null,
  constraint leave_date_range_valid check (start_date <= expected_return),
  approved_by uuid not null references public.campus_members(id) on delete restrict,
  actual_return timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.health_records (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  recorded_by uuid not null references public.campus_members(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  concern text not null,
  care_given text not null default '',
  follow_up_date date,
  notes text not null default ''
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  item_name text not null,
  unit text not null default 'kg',
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  minimum_quantity numeric(12,2) not null default 0 check (minimum_quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (campus_id, item_name)
);

create table if not exists public.stock_transactions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_change numeric(12,2) not null,
  supplier text not null default '',
  amount_paid numeric(12,2) not null default 0,
  note text not null default '',
  recorded_by uuid references public.campus_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  meal_date date not null,
  meal text not null check (meal in ('Breakfast','Lunch','Dinner')),
  menu text not null default '',
  served boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (campus_id, meal_date, meal)
);

create table if not exists public.exam_papers (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  title text not null default '',
  subject text not null default '',
  class_name text not null default '',
  exam_date date,
  duration text not null default '',
  questions jsonb not null default '[]'::jsonb,
  created_by uuid references public.campus_members(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  purpose text not null,
  method text not null default 'Cash',
  received_by uuid references public.campus_members(id) on delete set null,
  paid_at timestamptz not null default now()
);

create or replace function public.adjust_inventory_stock(
  p_item_id uuid,
  p_quantity_change numeric,
  p_supplier text default '',
  p_amount_paid numeric default 0,
  p_note text default ''
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_campus_role(array['admin']::public.campus_role[]) then
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
revoke all on function public.adjust_inventory_stock(uuid,numeric,text,numeric,text) from public;
grant execute on function public.adjust_inventory_stock(uuid,numeric,text,numeric,text) to authenticated;

create index if not exists students_campus_roll_idx on public.students(campus_id, roll_number);
create index if not exists attendance_campus_date_shift_idx on public.attendance(campus_id, attendance_date, shift);
create index if not exists leave_campus_return_idx on public.leave_records(campus_id, expected_return) where actual_return is null;
create index if not exists health_campus_followup_idx on public.health_records(campus_id, follow_up_date);
create index if not exists stock_campus_created_idx on public.stock_transactions(campus_id, created_at desc);

alter table public.campuses enable row level security;
alter table public.campus_members enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_records enable row level security;
alter table public.health_records enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_transactions enable row level security;
alter table public.meal_plans enable row level security;
alter table public.exam_papers enable row level security;
alter table public.fee_payments enable row level security;

drop policy if exists campus_read_member on public.campuses;
create policy campus_read_member on public.campuses for select to authenticated using (id = public.my_campus_id());

drop policy if exists members_read_campus on public.campus_members;
create policy members_read_campus on public.campus_members for select to authenticated using (campus_id = public.my_campus_id());

drop policy if exists students_read_campus on public.students;
create policy students_read_campus on public.students for select to authenticated using (campus_id = public.my_campus_id());
drop policy if exists students_add_staff on public.students;
create policy students_add_staff on public.students for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher']::public.campus_role[]));
drop policy if exists students_edit_staff on public.students;
create policy students_edit_staff on public.students for update to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher']::public.campus_role[])) with check (campus_id = public.my_campus_id());
drop policy if exists students_remove_admin on public.students;
create policy students_remove_admin on public.students for delete to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists attendance_read_campus on public.attendance;
create policy attendance_read_campus on public.attendance for select to authenticated using (campus_id = public.my_campus_id());
drop policy if exists attendance_add_staff on public.attendance;
create policy attendance_add_staff on public.attendance for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher','warden']::public.campus_role[]));
drop policy if exists attendance_edit_staff on public.attendance;
create policy attendance_edit_staff on public.attendance for update to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher','warden']::public.campus_role[])) with check (campus_id = public.my_campus_id());

drop policy if exists leave_read_campus on public.leave_records;
create policy leave_read_campus on public.leave_records for select to authenticated using (campus_id = public.my_campus_id());
drop policy if exists leave_add_warden on public.leave_records;
create policy leave_add_warden on public.leave_records for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','warden']::public.campus_role[]));
drop policy if exists leave_edit_warden on public.leave_records;
create policy leave_edit_warden on public.leave_records for update to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','warden']::public.campus_role[])) with check (campus_id = public.my_campus_id());
drop policy if exists leave_delete_warden on public.leave_records;
create policy leave_delete_warden on public.leave_records for delete to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','warden']::public.campus_role[]));

drop policy if exists health_read_authorised on public.health_records;
create policy health_read_authorised on public.health_records for select to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','health_worker']::public.campus_role[]));
drop policy if exists health_add_authorised on public.health_records;
create policy health_add_authorised on public.health_records for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','health_worker']::public.campus_role[]));
drop policy if exists health_edit_authorised on public.health_records;
create policy health_edit_authorised on public.health_records for update to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','health_worker']::public.campus_role[])) with check (campus_id = public.my_campus_id());

drop policy if exists inventory_read_campus on public.inventory_items;
create policy inventory_read_campus on public.inventory_items for select to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));
drop policy if exists inventory_add_kitchen on public.inventory_items;
create policy inventory_add_kitchen on public.inventory_items for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));
drop policy if exists inventory_edit_kitchen on public.inventory_items;
create policy inventory_edit_kitchen on public.inventory_items for update to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[])) with check (campus_id = public.my_campus_id());

drop policy if exists stock_read_campus on public.stock_transactions;
create policy stock_read_campus on public.stock_transactions for select to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));
drop policy if exists stock_add_kitchen on public.stock_transactions;
create policy stock_add_kitchen on public.stock_transactions for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists meals_read_campus on public.meal_plans;
create policy meals_read_campus on public.meal_plans for select to authenticated using (campus_id = public.my_campus_id());
drop policy if exists meals_manage_kitchen on public.meal_plans;
create policy meals_manage_kitchen on public.meal_plans for all to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','kitchen']::public.campus_role[])) with check (campus_id = public.my_campus_id());

drop policy if exists papers_read_campus on public.exam_papers;
create policy papers_read_campus on public.exam_papers for select to authenticated using (campus_id = public.my_campus_id());
drop policy if exists papers_manage_teacher on public.exam_papers;
create policy papers_manage_teacher on public.exam_papers for all to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin','teacher']::public.campus_role[])) with check (campus_id = public.my_campus_id());

drop policy if exists fees_read_authorised on public.fee_payments;
create policy fees_read_authorised on public.fee_payments for select to authenticated using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));
drop policy if exists fees_add_authorised on public.fee_payments;
create policy fees_add_authorised on public.fee_payments for insert to authenticated with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

grant usage on schema public to authenticated;
grant select on public.campuses, public.campus_members to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant select, insert, update, delete on public.leave_records to authenticated;
grant select, insert, update on public.health_records to authenticated;
grant select, insert, update on public.inventory_items to authenticated;
grant select, insert on public.stock_transactions to authenticated;
grant select, insert, update, delete on public.meal_plans to authenticated;
grant select, insert, update, delete on public.exam_papers to authenticated;
grant select, insert on public.fee_payments to authenticated;

-- Supabase Realtime is optional. The app refreshes directly after each save.
