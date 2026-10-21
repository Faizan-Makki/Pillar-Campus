const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../pricing.js');

test('Starter monthly prices match the approved examples', () => {
  assert.equal(pricing.monthlyTotal(0), 499);
  assert.equal(pricing.monthlyTotal(1), 598);
  assert.equal(pricing.monthlyTotal(3), 796);
  assert.equal(pricing.monthlyTotal(8), 1291);
});

test('INR formatting uses whole rupees and Indian digit grouping', () => {
  assert.equal(pricing.formatInr(499), '₹499/month');
  assert.equal(pricing.formatInr(1291), '₹1,291/month');
});

test('one Admin/Director account is excluded and extra staff accounts consume seats', () => {
  assert.equal(pricing.activeStaffSeats(['director', 'teacher', 'warden']), 2);
  assert.equal(pricing.activeStaffSeats(['admin', 'teacher', 'kitchen']), 2);
  assert.equal(pricing.activeStaffSeats(['director', 'admin', 'teacher']), 2);
  assert.equal(pricing.activeStaffSeats(['director']), 0);
});

test('only pending invitations with a future expiry reserve seats', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  assert.equal(pricing.validPendingInvitations([
    { status: 'pending', expires_at: '2026-10-22T00:00:00Z' },
    { status: 'pending', expires_at: '2026-10-20T00:00:00Z' },
    { status: 'accepted', expires_at: '2026-10-22T00:00:00Z' }
  ], now), 1);
});

test('seat capacity permits an invite while a seat is free and blocks the next one', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  const roles = ['director', 'teacher'];
  const pending = [{ status: 'pending', expires_at: '2026-10-22T00:00:00Z' }];
  assert.deepEqual(pricing.seatCapacity(roles, pending, 0, now), {used:1,reserved:1,allowance:2,remaining:0,canInvite:false});
  assert.equal(pricing.seatCapacity(['director'], [], 0, now).canInvite, true);
});

test('expired and revoked invitations release reservations', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  const invitations = [
    {status:'pending',expires_at:'2026-10-20T00:00:00Z'},
    {status:'revoked',expires_at:'2026-10-22T00:00:00Z'}
  ];
  assert.deepEqual(pricing.seatCapacity(['director','teacher'], invitations, 0, now), {used:1,reserved:0,allowance:2,remaining:1,canInvite:true});
});

test('seat requests reject malformed or unreasonable quantities', () => {
  for (const value of [-1, 1.5, 1001, 'nope']) assert.throws(() => pricing.validSeatCount(value));
  assert.equal(pricing.validSeatCount(100), 100);
});
