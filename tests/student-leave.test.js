const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const leave = require('../leave-utils.js');
const access = require('../access-utils.js');

const root = path.join(__dirname, '..');
const backend = fs.readFileSync(path.join(root, 'backend.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202610240001_student_leave_admin_access.sql'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');

test('active leave includes both India-local date boundaries and excludes returned or out-of-range records', () => {
  const base = { studentId: 'student-1', startDate: '2026-10-24', endDate: '2026-10-26' };
  assert.equal(leave.isActiveToday(base, '2026-10-24'), true);
  assert.equal(leave.isActiveToday(base, '2026-10-26'), true);
  assert.equal(leave.isActiveToday(base, '2026-10-23'), false);
  assert.equal(leave.isActiveToday(base, '2026-10-27'), false);
  assert.equal(leave.isActiveToday({ ...base, actualReturn: '2026-10-25T09:00:00Z' }, '2026-10-25'), false);
});

test('active leave count uses distinct student ids when leave periods overlap', () => {
  const records = [
    { studentId: 'one', startDate: '2026-10-20', endDate: '2026-10-25' },
    { studentId: 'one', startDate: '2026-10-24', endDate: '2026-10-26' },
    { studentId: 'two', startDate: '2026-10-25', endDate: '2026-10-25' },
    { studentId: 'three', startDate: '2026-10-26', endDate: '2026-10-27' }
  ];
  assert.deepEqual([...leave.activeStudentIds(records, '2026-10-25')].sort(), ['one', 'two']);
});

test('leave date validation rejects impossible dates and the database migration adds a range constraint', () => {
  assert.equal(leave.validIsoDate('2024-02-29'), true);
  assert.equal(leave.validIsoDate('2026-02-29'), false);
  assert.equal(leave.validIsoDate('2026-13-01'), false);
  assert.match(migration, /check \(start_date <= expected_return\) not valid/i);
  assert.match(schema, /constraint leave_date_range_valid check \(start_date <= expected_return\)/i);
});

test('fees and inventory rows are Admin-only in RLS and leave delete remains campus-and-role scoped', () => {
  assert.match(migration, /create policy inventory_read_campus[\s\S]*?has_campus_role\(array\['admin'\]/i);
  assert.match(migration, /create policy fees_read_authorised[\s\S]*?has_campus_role\(array\['admin'\]/i);
  assert.match(migration, /create policy leave_delete_warden[\s\S]*?campus_id = public\.my_campus_id\(\)[\s\S]*?has_campus_role\(array\['admin','warden'\]/i);
  assert.match(migration, /adjust_inventory_stock[\s\S]*?has_campus_role\(array\['admin'\]/i);
  assert.doesNotMatch(migration, /drop table|delete from public\.(campuses|students|campus_members|campus_subscriptions)/i);
});

test('UI routes are Admin-only while leave write actions check the authenticated campus role', () => {
  assert.equal(access.canAccessPage('fees', 'admin'), true);
  assert.equal(access.canAccessPage('kitchen', 'admin'), true);
  for (const role of ['teacher', 'warden', 'health_worker', 'kitchen', 'bursar', 'platform_owner']) {
    assert.equal(access.canAccessPage('fees', role), false);
    assert.equal(access.canAccessPage('kitchen', role), false);
  }
  assert.equal(access.canAccessPage('students', 'teacher'), true);
  assert.match(backend, /function liveCanOpenPage\(page\).*PillarAccessUtils\.canAccessPage\(page, pillarLive\.member\?\.role\)/);
  assert.match(backend, /if \(!liveCanOpenPage\(currentPage\)\)/);
  assert.match(backend, /if \(!liveCan\('admin', 'warden'\)\) throw new Error\('Only an admin or warden can manage student leave\.'/);
  assert.match(backend, /from\('leave_records'\)\.delete\(\)\.eq\('id', record\.id\)\.eq\('campus_id', pillarLive\.member\.campus_id\)/);
});
