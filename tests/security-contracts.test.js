const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202610210001_pricing_manual_seats.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/campus-admin/index.ts'), 'utf8');

test('migration initializes existing and new campuses without overwriting data', () => {
  assert.match(migration, /insert into public\.campus_subscriptions\(campus_id\)[\s\S]*?on conflict \(campus_id\) do nothing/i);
  assert.match(migration, /after insert on public\.campuses/i);
});

test('invitation reservation is transactional, director-only, and includes active plus pending seats', () => {
  assert.match(migration, /reserve_staff_invitation[\s\S]*?pillar_require_director\(p_actor_user_id\)/i);
  assert.match(migration, /from public\.campus_subscriptions where campus_id = v_campus_id for update/i);
  assert.match(migration, /finish_staff_invitation[\s\S]*?from public\.campus_subscriptions where campus_id=v_campus_id for update/i);
  assert.match(migration, /revoke_staff_invitation[\s\S]*?from public\.campus_subscriptions where campus_id=v_campus_id for update/i);
  assert.match(migration, /public\.pillar_staff_seats_used\(v_campus_id\)/i);
  assert.match(migration, /status='pending' and expires_at>now\(\)/i);
  assert.match(migration, /v_used \+ v_reserved >= v_sub\.included_staff_seats \+ v_sub\.additional_seats/i);
  assert.match(migration, /on public\.staff_invitations\(lower\(invited_email\)\) where status = 'pending'/i);
  assert.match(migration, /where status = 'pending' and expires_at <= now\(\)/i);
  assert.match(migration, /select 1 from public\.campus_members m join auth\.users u on u\.id=m\.user_id[\s\S]*?staff_account_already_linked/i);
});

test('invitation acceptance, expiry, revocation, and request creation keep seat reservations consistent', () => {
  assert.match(migration, /create or replace function public\.accept_staff_invitation/i);
  assert.match(migration, /set status='expired'[\s\S]*?expires_at<=now\(\)/i);
  assert.match(migration, /set status='revoked'/i);
  assert.match(migration, /create unique index if not exists subscription_one_pending_request_idx/i);
  assert.match(migration, /from public\.campus_subscriptions where campus_id=v_campus_id for update/i);
});

test('founder approval and manual updates are protected by a server-managed founder list and audit changes', () => {
  assert.match(migration, /create table if not exists public\.campus_founders/i);
  assert.match(migration, /perform public\.pillar_require_founder\(p_actor_user_id\)/i);
  assert.match(migration, /revoke all on function public\.resolve_seat_request[\s\S]*?from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function[\s\S]*?to service_role/i);
  assert.match(migration, /public\.subscription_audit_log/i);
  assert.match(edge, /async function requireFounder/i);
  assert.match(edge, /if \(action === 'founder_snapshot'\)/i);
  assert.match(edge, /if \(action === 'resolve_seat_request'\)/i);
  assert.match(edge, /if \(action === 'adjust_seats'\)\s*\{\s*await requireFounder/i);
  assert.match(migration, /revoke all on function public\.adjust_subscription_seats[\s\S]*?from public, anon, authenticated/i);
});

test('director seat requests are campus-scoped and founder changes record dates and audit history', () => {
  assert.match(migration, /submit_seat_request\([\s\S]*?pillar_require_director\(p_actor_user_id\)/i);
  assert.match(migration, /subscription_one_pending_request_idx[\s\S]*?where status = 'pending'/i);
  assert.match(migration, /resolve_seat_request\([\s\S]*?pillar_require_founder\(p_actor_user_id\)/i);
  assert.match(migration, /billing_start_date_required/i);
  assert.match(migration, /effective_date_required/i);
  assert.match(migration, /subscription_audit_log\(campus_id,actor_user_id,action,previous_state,new_state,reason,request_id\)/i);
});

test('new subscription records remain private and authenticated users cannot mutate seat or billing records', () => {
  assert.match(migration, /alter table public\.campus_subscriptions enable row level security/i);
  assert.match(migration, /create policy campus_subscription_director_read[\s\S]*?my_campus_role\(\)='director'/i);
  assert.match(migration, /create policy staff_invitation_director_read[\s\S]*?my_campus_role\(\)='director'/i);
  assert.match(migration, /create policy seat_request_director_read[\s\S]*?my_campus_role\(\)='director'/i);
  assert.match(migration, /revoke insert, update, delete on public\.campus_subscriptions, public\.staff_invitations, public\.subscription_seat_requests from anon, authenticated/i);
  assert.match(migration, /revoke select on public\.subscription_seat_requests from anon, authenticated/i);
  assert.match(edge, /subscription_seat_requests'[\s\S]*?director_message,created_at/i);
  assert.match(migration, /revoke all on public\.campus_founders, public\.campus_manual_payments, public\.subscription_audit_log from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on public\.campus_members to service_role/i);
});

test('Edge Function authenticates users and restricts director actions to their own membership', () => {
  assert.match(edge, /auth\.getUser\(\)/i);
  assert.match(edge, /async function requireDirector/i);
  assert.match(edge, /\.eq\('user_id', userId\)\.eq\('active', true\)\.eq\('role', 'director'\)/i);
  assert.match(edge, /async function directorSummary[\s\S]*?member\.campus_id/i);
});

test('payment recording is manual and never exposes payment-provider or card collection code', () => {
  assert.match(edge, /if \(action === 'record_payment'\)/i);
  assert.match(migration, /create table if not exists public\.campus_manual_payments/i);
  assert.doesNotMatch(edge, /stripe|razorpay|card_number|cvv/i);
});
