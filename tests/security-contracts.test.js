const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const billing = fs.readFileSync(path.join(root, 'supabase/migrations/202610210001_pricing_manual_seats.sql'), 'utf8');
const roles = fs.readFileSync(path.join(root, 'supabase/migrations/202610230001_admin_platform_owner.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/campus-admin/index.ts'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'backend.js'), 'utf8');

test('subscription migration initializes existing/new campuses without overwriting subscriptions', () => {
  assert.match(billing, /insert into public\.campus_subscriptions\(campus_id\)[\s\S]*?on conflict \(campus_id\) do nothing/i);
  assert.match(billing, /after insert on public\.campuses/i);
  assert.match(billing, /base_price_inr integer not null default 499/i);
  assert.match(billing, /included_staff_seats integer not null default 2/i);
  assert.match(billing, /additional_seat_price_inr integer not null default 99/i);
});

test('Admin migration preserves owners and blocks ambiguous Director-to-Admin conversion', () => {
  assert.match(roles, /create table if not exists public\.platform_owners/i);
  assert.match(roles, /from public\.campus_founders[\s\S]*?on conflict \(user_id\) do nothing/i);
  assert.match(roles, /admin_role_migration_conflict/i);
  assert.match(roles, /update public\.campus_members set role = 'admin' where role = 'director'/i);
  assert.match(roles, /campus_members_role_no_director_check/i);
  assert.match(roles, /create unique index if not exists campus_members_one_active_admin_idx[\s\S]*?where active and role = 'admin'/i);
});

test('only one Admin is excluded from staff use and invitations reserve seats transactionally', () => {
  assert.match(roles, /role = 'admin'\)::integer, 1\)/i);
  assert.match(roles, /reserve_staff_invitation[\s\S]*?pillar_require_admin\(p_actor_user_id\)/i);
  assert.match(roles, /from public\.campus_subscriptions where campus_id=v_campus_id for update/i);
  assert.match(roles, /v_used \+ v_reserved >= v_sub\.included_staff_seats \+ v_sub\.additional_seats/i);
  assert.match(edge, /const STAFF_ROLES = new Set\(\['teacher', 'warden', 'health_worker', 'kitchen', 'bursar'\]\)/i);
  assert.doesNotMatch(edge, /request_seats|resolve_seat_request|record_payment|adjust_seats/);
});

test('platform owner checks are separate from institute membership and hidden behind the Edge Function', () => {
  assert.match(roles, /create or replace function public\.pillar_is_platform_owner/i);
  assert.match(roles, /revoke all on public\.platform_owners from anon, authenticated/i);
  assert.match(edge, /async function requirePlatformOwner[\s\S]*?from\('platform_owners'\)/i);
  assert.match(edge, /if\(action==='platform_owner_summary'\)\{await requirePlatformOwner\(user\.id\)/i);
  assert.match(edge, /if\(action==='platform_owner_status'\)\{await requirePlatformOwner\(user\.id\)/i);
});

test('institute data and dynamic names come from the authenticated membership', () => {
  assert.match(schema, /using \(id = public\.my_campus_id\(\)\)/i);
  assert.match(schema, /campus_id = public\.my_campus_id\(\)/i);
  assert.match(backend, /from\('campus_members'\)[\s\S]*?eq\('user_id',\s*session\.user\.id\)/i);
  assert.match(backend, /from\('campuses'\)[\s\S]*?eq\('id',\s*pillarLive\.member\.campus_id\)/i);
  assert.match(backend, /textContent\s*=\s*campus\.name/i);
});

test('Admin RLS and backend checks replace Director authorization', () => {
  assert.match(schema, /campus_members_role_no_director_check check \(role <> 'director'\)/i);
  assert.match(roles, /public\.my_campus_role\(\)='admin'/i);
  assert.doesNotMatch(roles, /has_campus_role\(array\[[^\]]*'director'/i);
  assert.match(edge, /auth\.getUser\(\)/i);
  assert.match(edge, /async function requireAdmin[\s\S]*?eq\('user_id',userId\)\.eq\('active',true\)\.eq\('role','admin'\)/i);
  assert.doesNotMatch(edge, /director|founder_snapshot|seat_request|record_payment|adjust_seats/i);
});
