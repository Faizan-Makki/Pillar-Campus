/* Shared browser-side mirror of public.pillar_monthly_total in the migration. */
(function (root, factory) {
  const pricing = factory();
  if (typeof module === 'object' && module.exports) module.exports = pricing;
  root.PillarPricing = pricing;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const BASE_PRICE_INR = 499;
  const INCLUDED_STAFF_SEATS = 2;
  const ADDITIONAL_SEAT_PRICE_INR = 99;
  const MAX_ADDITIONAL_SEATS = 1000;
  const PRINCIPAL_ROLES = new Set(['director', 'admin']);

  function validSeatCount(value, label = 'Additional seats') {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_ADDITIONAL_SEATS) {
      throw new RangeError(`${label} must be a whole number from 0 to ${MAX_ADDITIONAL_SEATS}.`);
    }
    return count;
  }

  function monthlyTotal(additionalSeats, basePrice = BASE_PRICE_INR, perSeatPrice = ADDITIONAL_SEAT_PRICE_INR) {
    const seats = validSeatCount(additionalSeats);
    if (!Number.isSafeInteger(basePrice) || !Number.isSafeInteger(perSeatPrice) || basePrice < 0 || perSeatPrice < 0) {
      throw new RangeError('Prices must be non-negative whole rupee amounts.');
    }
    return basePrice + (seats * perSeatPrice);
  }

  function formatInr(amount, suffix = '/month') {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Amount must be whole rupees.');
    return `₹${amount.toLocaleString('en-IN')}${suffix}`;
  }

  // One active Admin/Director is included; any additional privileged account
  // consumes a staff seat. This keeps a second admin from bypassing the cap.
  function activeStaffSeats(roles) {
    const roleList = Array.isArray(roles) ? roles : [];
    const principalCount = roleList.filter(role => PRINCIPAL_ROLES.has(String(role).toLowerCase())).length;
    return Math.max(0, roleList.length - Math.min(principalCount, 1));
  }

  function validPendingInvitations(invitations, now = Date.now()) {
    return (Array.isArray(invitations) ? invitations : []).filter(invitation =>
      invitation?.status === 'pending' && Number.isFinite(Date.parse(invitation.expires_at)) && Date.parse(invitation.expires_at) > now
    ).length;
  }

  function seatCapacity(activeRoles, invitations, additionalSeats, now = Date.now()) {
    const extra = validSeatCount(additionalSeats);
    const used = activeStaffSeats(activeRoles);
    const reserved = validPendingInvitations(invitations, now);
    const allowance = INCLUDED_STAFF_SEATS + extra;
    return { used, reserved, allowance, remaining: Math.max(0, allowance - used - reserved), canInvite: used + reserved < allowance };
  }

  return Object.freeze({
    BASE_PRICE_INR,
    INCLUDED_STAFF_SEATS,
    ADDITIONAL_SEAT_PRICE_INR,
    MAX_ADDITIONAL_SEATS,
    monthlyTotal,
    formatInr,
    activeStaffSeats,
    validPendingInvitations,
    seatCapacity,
    validSeatCount
  });
});
