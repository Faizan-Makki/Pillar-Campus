-- Add student leave date ranges and Admin-only access to fees and stock registers.
-- Existing rows use their creation date in India as the best available leave-start estimate,
-- capped at the expected return date so older rows remain valid.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leave_records'
      and column_name = 'start_date'
  ) then
    alter table public.leave_records
      add column start_date date not null default current_date;
    update public.leave_records
    set start_date = least((created_at at time zone 'Asia/Kolkata')::date, expected_return);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leave_date_range_valid'
      and conrelid = 'public.leave_records'::regclass
  ) then
    alter table public.leave_records
      add constraint leave_date_range_valid
      check (start_date <= expected_return) not valid;
  end if;
end;
$$;

grant select, insert, update, delete on public.leave_records to authenticated;

drop policy if exists leave_delete_warden on public.leave_records;
create policy leave_delete_warden on public.leave_records
  for delete to authenticated
  using (
    campus_id = public.my_campus_id()
    and public.has_campus_role(array['admin','warden']::public.campus_role[])
  );

drop policy if exists inventory_read_campus on public.inventory_items;
create policy inventory_read_campus on public.inventory_items
  for select to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists inventory_add_kitchen on public.inventory_items;
create policy inventory_add_kitchen on public.inventory_items
  for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists inventory_edit_kitchen on public.inventory_items;
create policy inventory_edit_kitchen on public.inventory_items
  for update to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]))
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists stock_read_campus on public.stock_transactions;
create policy stock_read_campus on public.stock_transactions
  for select to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists stock_add_kitchen on public.stock_transactions;
create policy stock_add_kitchen on public.stock_transactions
  for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists fees_read_authorised on public.fee_payments;
create policy fees_read_authorised on public.fee_payments
  for select to authenticated
  using (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

drop policy if exists fees_add_authorised on public.fee_payments;
create policy fees_add_authorised on public.fee_payments
  for insert to authenticated
  with check (campus_id = public.my_campus_id() and public.has_campus_role(array['admin']::public.campus_role[]));

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
