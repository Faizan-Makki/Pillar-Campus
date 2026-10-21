import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const STAFF_ROLES = new Set(['admin', 'teacher', 'warden', 'health_worker', 'kitchen', 'bursar']);
const PAGE_URL = 'https://faizan-makki.github.io/Pillar-Campus/';

function validISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function keyFromEnv(jsonName: string, legacyNames: string[]): string {
  const packed = Deno.env.get(jsonName);
  if (packed) {
    try {
      const values = JSON.parse(packed) as Record<string, string>;
      const key = values.default || Object.values(values)[0];
      if (key) return key;
    } catch { /* Hosted legacy values are checked below. */ }
  }
  for (const name of legacyNames) {
    const key = Deno.env.get(name);
    if (key) return key;
  }
  throw new Error(`Missing required Supabase function key: ${jsonName}`);
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
if (!supabaseUrl) throw new Error('SUPABASE_URL is not available in this function environment.');
const publishableKey = keyFromEnv('SUPABASE_PUBLISHABLE_KEYS', ['SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY']);
const secretKey = keyFromEnv('SUPABASE_SECRET_KEYS', ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function fail(message: string, status = 400): Response {
  return reply(status, { error: message });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Request failed.');
}

function mapErrorStatus(message: string): number {
  if (/director_required|founder_required|not authorized/i.test(message)) return 403;
  if (/seat_limit_reached|already_pending|pending_request|approved_limit_below_usage|invitation_already_pending|staff_account_already_linked/i.test(message)) return 409;
  if (/invalid_|too_long|reason_required/i.test(message)) return 400;
  return 500;
}

function friendlyError(message: string): string {
  if (/seat_limit_reached/i.test(message)) return "You've used all staff seats in your plan. Request additional seats before inviting more staff.";
  if (/invitation_already_pending/i.test(message)) return 'An invitation for this email is already pending.';
  if (/staff_account_already_linked/i.test(message)) return 'This account is already linked to an active campus. Ask the current campus director to manage its access.';
  if (/request_already_pending/i.test(message)) return 'A seat request is already waiting for review.';
  if (/approved_limit_below_usage/i.test(message)) return 'The new seat limit is below current staff use or pending invitations.';
  if (/founder_required/i.test(message)) return 'Only the configured Pillar Campus founder can use this action.';
  if (/director_required/i.test(message)) return 'Only the campus director can manage staff invitations and seat requests.';
  if (/pending_invitation_not_found/i.test(message)) return 'This invitation is no longer pending. Refresh the staff list.';
  if (/pending_request_not_found/i.test(message)) return 'This request is no longer pending. Refresh the request list.';
  if (/invalid_email/i.test(message)) return 'Enter a valid email address.';
  if (/invalid_display_name/i.test(message)) return 'Enter a staff name between 2 and 120 characters.';
  if (/invalid_phone/i.test(message)) return 'The phone number is too long.';
  if (/invalid_staff_role/i.test(message)) return 'Choose an available staff role.';
  if (/invalid_requested_quantity/i.test(message)) return 'Request a whole number of additional seats from 1 to 100.';
  if (/reason_required/i.test(message)) return 'Add a reason so the seat-limit change can be audited.';
  if (/invalid_approved_quantity/i.test(message)) return 'Enter a whole number of additional seats from 0 to 1,000.';
  if (/approved_quantity_must_increase/i.test(message)) return 'An approved request must add at least one seat. Reject it or use the manual adjustment form.';
  if (/billing_start_date_required/i.test(message)) return 'Choose the agreed billing start date before approving this request.';
  if (/effective_date_required/i.test(message)) return 'Choose an effective date for the seat-limit change.';
  if (/invalid_payment_amount/i.test(message)) return 'Enter a verified payment amount in whole rupees.';
  if (/email invite could not be sent/i.test(message)) return message;
  if (/invite email was sent but its seat could not be linked/i.test(message)) return 'The invitation email was sent, but Pillar Campus could not finish linking its reserved seat. Do not send another invite; ask the founder to review it.';
  return 'The secure subscription service could not complete this action. Refresh and try again, or ask the founder for help.';
}

async function authenticatedUser(request: Request): Promise<{ user: User; client: SupabaseClient }> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Response(JSON.stringify({ error: 'Sign in again to continue.' }), { status: 401, headers: corsHeaders });
  const client = createClient(supabaseUrl!, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Response(JSON.stringify({ error: 'Your sign-in has expired. Please sign in again.' }), { status: 401, headers: corsHeaders });
  return { user: data.user, client };
}

async function requireDirector(userId: string): Promise<{ id: string; campus_id: string; display_name: string }> {
  const { data, error } = await admin.from('campus_members')
    .select('id,campus_id,display_name,role,active')
    .eq('user_id', userId).eq('active', true).eq('role', 'director').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('director_required');
  return data;
}

async function requireFounder(userId: string): Promise<void> {
  const { data, error } = await admin.from('campus_founders').select('user_id')
    .eq('user_id', userId).eq('active', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('founder_required');
}

async function expireInvitations(): Promise<void> {
  const { error } = await admin.rpc('expire_staff_invitations');
  if (error) throw new Error(error.message);
}

async function directorSummary(member: { campus_id: string }) {
  await expireInvitations();
  const now = new Date().toISOString();
  const [subscription, members, invitations, requests] = await Promise.all([
    admin.from('campus_subscriptions').select('*').eq('campus_id', member.campus_id).maybeSingle(),
    admin.from('campus_members').select('role').eq('campus_id', member.campus_id).eq('active', true),
    admin.from('staff_invitations').select('id,invited_email,display_name,role,status,expires_at,invited_at,created_at').eq('campus_id', member.campus_id).order('created_at', { ascending: false }),
    admin.from('subscription_seat_requests').select('id,requested_quantity,current_approved_quantity,proposed_additional_quantity,proposed_monthly_total_inr,reason,status,approved_additional_quantity,resolved_at,billing_start_date,director_message,created_at').eq('campus_id', member.campus_id).order('created_at', { ascending: false }).limit(20)
  ]);
  for (const result of [subscription, members, invitations, requests]) if (result.error) throw new Error(result.error.message);
  const plan = subscription.data;
  if (!plan) throw new Error('subscription_not_configured');
  const roles = (members.data || []).map(row => row.role);
  const privileged = roles.filter(role => role === 'director' || role === 'admin').length;
  const activeStaffUsed = Math.max(0, roles.length - Math.min(privileged, 1));
  const activeInvitations = (invitations.data || []).filter(row => row.status === 'pending' && Date.parse(row.expires_at) > Date.now());
  const allowance = plan.included_staff_seats + plan.additional_seats;
  return {
    subscription: plan,
    active_staff_used: activeStaffUsed,
    pending_invitations: activeInvitations,
    pending_invitation_count: activeInvitations.length,
    total_staff_allowance: allowance,
    remaining_seats: Math.max(0, allowance - activeStaffUsed - activeInvitations.length),
    requests: requests.data || [],
    server_time: now
  };
}

async function founderSnapshot() {
  await expireInvitations();
  const [subscriptions, campuses, members, invitations, requests, payments, audit] = await Promise.all([
    admin.from('campus_subscriptions').select('*').order('updated_at', { ascending: false }),
    admin.from('campuses').select('id,name,slug'),
    admin.from('campus_members').select('campus_id,role,active,display_name').eq('active', true),
    admin.from('staff_invitations').select('id,campus_id,invited_email,display_name,role,status,expires_at,created_at').order('created_at', { ascending: false }).limit(500),
    admin.from('subscription_seat_requests').select('id,campus_id,requested_by,requested_quantity,current_approved_quantity,proposed_additional_quantity,proposed_monthly_total_inr,reason,status,approved_additional_quantity,resolved_by,resolved_at,billing_start_date,director_message,internal_note,created_at').order('created_at', { ascending: false }).limit(500),
    admin.from('campus_manual_payments').select('id,campus_id,amount_inr,payment_date,next_billing_date,reference,note,recorded_by,created_at').order('payment_date', { ascending: false }).limit(200),
    admin.from('subscription_audit_log').select('id,campus_id,actor_user_id,action,previous_state,new_state,reason,request_id,created_at').order('created_at', { ascending: false }).limit(200)
  ]);
  for (const result of [subscriptions, campuses, members, invitations, requests, payments, audit]) if (result.error) throw new Error(result.error.message);
  const names = new Map((campuses.data || []).map(campus => [campus.id, campus]));
  const rolesByCampus = new Map<string, string[]>();
  for (const member of members.data || []) {
    const list = rolesByCampus.get(member.campus_id) || [];
    list.push(member.role);
    rolesByCampus.set(member.campus_id, list);
  }
  const now = Date.now();
  const planRows = (subscriptions.data || []).map(plan => {
    const roles = rolesByCampus.get(plan.campus_id) || [];
    const activeStaffUsed = Math.max(0, roles.length - Math.min(roles.filter(role => role === 'director' || role === 'admin').length, 1));
    const activeInvitations = (invitations.data || []).filter(invite => invite.campus_id === plan.campus_id && invite.status === 'pending' && Date.parse(invite.expires_at) > now);
    return {
      ...plan,
      campus: names.get(plan.campus_id) || { id: plan.campus_id, name: 'Campus', slug: '' },
      active_staff_used: activeStaffUsed,
      pending_invitations: activeInvitations,
      pending_invitation_count: activeInvitations.length,
      total_staff_allowance: plan.included_staff_seats + plan.additional_seats,
      remaining_seats: Math.max(0, plan.included_staff_seats + plan.additional_seats - activeStaffUsed - activeInvitations.length)
    };
  });
  return { campuses: planRows, requests: requests.data || [], payments: payments.data || [], audit: audit.data || [] };
}

async function inviteStaff(user: User, payload: Record<string, unknown>) {
  await requireDirector(user.id);
  const email = String(payload.email || '').trim().toLowerCase();
  const displayName = String(payload.display_name || '').trim();
  const phone = String(payload.phone || '').trim();
  const role = String(payload.role || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error('invalid_email');
  if (displayName.length < 2 || displayName.length > 120) throw new Error('invalid_display_name');
  if (phone.length > 40) throw new Error('invalid_phone');
  if (!STAFF_ROLES.has(role)) throw new Error('invalid_staff_role');

  const { data: reservation, error: reserveError } = await admin.rpc('reserve_staff_invitation', {
    p_actor_user_id: user.id, p_email: email, p_display_name: displayName, p_phone: phone, p_role: role
  });
  if (reserveError) throw new Error(reserveError.message);
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: PAGE_URL
  });
  if (inviteError || !invited.user?.id) {
    await admin.rpc('fail_staff_invitation', {
      p_actor_user_id: user.id,
      p_invitation_id: reservation.invitation_id,
      p_reason: inviteError?.message || 'Supabase did not return an invited user.'
    });
    throw new Error('Email invite could not be sent. The reserved staff seat has been released. Check SMTP settings and try again.');
  }
  const { error: finishError } = await admin.rpc('finish_staff_invitation', {
    p_actor_user_id: user.id, p_invitation_id: reservation.invitation_id, p_auth_user_id: invited.user.id
  });
  if (finishError) throw new Error('The invite email was sent but its seat could not be linked. Do not resend; ask the founder to review this invitation.');
  return { invitation_id: reservation.invitation_id, invited: true, reserved_seats: reservation.reserved, remaining_seats: Math.max(0, reservation.allowance - reservation.used - reservation.reserved) };
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return fail('Use a signed-in Pillar Campus session to continue.', 405);

  let identity: { user: User; client: SupabaseClient };
  let payload: Record<string, unknown>;
  try {
    identity = await authenticatedUser(request);
    payload = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('Invalid request.');
  } catch (error) {
    if (error instanceof Response) return error;
    return fail('Could not read your request.', 400);
  }

  const { user } = identity;
  const action = String(payload.action || '');
  try {
    if (action === 'accept_invitation') {
      const { data, error } = await admin.rpc('accept_staff_invitation', { p_user_id: user.id });
      if (error) throw new Error(error.message);
      return reply(200, data || { accepted: false });
    }

    if (action === 'director_summary') {
      const member = await requireDirector(user.id);
      return reply(200, await directorSummary(member));
    }

    if (action === 'invite_staff') return reply(200, await inviteStaff(user, payload));

    if (action === 'revoke_invitation') {
      await requireDirector(user.id);
      const invitationId = String(payload.invitation_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(invitationId)) throw new Error('invalid_invitation_id');
      const { error } = await admin.rpc('revoke_staff_invitation', { p_actor_user_id: user.id, p_invitation_id: invitationId, p_reason: 'Cancelled by director' });
      if (error) throw new Error(error.message);
      return reply(200, { revoked: true });
    }

    if (action === 'request_seats') {
      await requireDirector(user.id);
      const quantity = Number(payload.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('invalid_requested_quantity');
      const reason = String(payload.reason || '').trim();
      if (reason.length > 1000) throw new Error('reason_too_long');
      const { data, error } = await admin.rpc('submit_seat_request', { p_actor_user_id: user.id, p_requested_quantity: quantity, p_reason: reason });
      if (error) throw new Error(error.message);
      return reply(200, { request_id: data, status: 'pending' });
    }

    if (action === 'cancel_seat_request') {
      await requireDirector(user.id);
      const requestId = String(payload.request_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('invalid_request_id');
      const { error } = await admin.rpc('cancel_seat_request', { p_actor_user_id: user.id, p_request_id: requestId });
      if (error) throw new Error(error.message);
      return reply(200, { cancelled: true });
    }

    if (action === 'founder_snapshot') {
      await requireFounder(user.id);
      return reply(200, await founderSnapshot());
    }

    if (action === 'resolve_seat_request') {
      await requireFounder(user.id);
      const decision = String(payload.decision || '');
      const requestId = String(payload.request_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('invalid_request_id');
      const quantity = payload.approved_additional_quantity === '' || payload.approved_additional_quantity == null
        ? null : Number(payload.approved_additional_quantity);
      if (decision === 'approved' && (!Number.isSafeInteger(quantity) || quantity! < 0 || quantity! > 1000)) throw new Error('invalid_approved_quantity');
      const startDate = payload.billing_start_date ? String(payload.billing_start_date) : null;
      if (startDate && !validISODate(startDate)) throw new Error('invalid_billing_start_date');
      if (decision === 'approved' && !startDate) throw new Error('billing_start_date_required');
      const { data, error } = await admin.rpc('resolve_seat_request', {
        p_actor_user_id: user.id,
        p_request_id: requestId,
        p_decision: decision,
        p_approved_additional_quantity: quantity,
        p_billing_start_date: startDate,
        p_director_message: String(payload.director_message || '').trim(),
        p_internal_note: String(payload.internal_note || '').trim()
      });
      if (error) throw new Error(error.message);
      return reply(200, data);
    }

    if (action === 'adjust_seats') {
      await requireFounder(user.id);
      const campusId = String(payload.campus_id || '');
      const quantity = Number(payload.additional_seats);
      const effectiveDate = payload.effective_date ? String(payload.effective_date) : null;
      const reason = String(payload.reason || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(campusId)) throw new Error('invalid_campus_id');
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000) throw new Error('invalid_approved_quantity');
      if (!effectiveDate) throw new Error('effective_date_required');
      if (effectiveDate && !validISODate(effectiveDate)) throw new Error('invalid_effective_date');
      const { data, error } = await admin.rpc('adjust_subscription_seats', {
        p_actor_user_id: user.id, p_campus_id: campusId, p_additional_seats: quantity,
        p_effective_date: effectiveDate, p_reason: reason
      });
      if (error) throw new Error(error.message);
      return reply(200, data);
    }

    if (action === 'record_payment') {
      await requireFounder(user.id);
      const campusId = String(payload.campus_id || '');
      const amount = Number(payload.amount_inr);
      const paymentDate = String(payload.payment_date || '');
      const nextBillingDate = payload.next_billing_date ? String(payload.next_billing_date) : null;
      if (!/^[0-9a-f-]{36}$/i.test(campusId)) throw new Error('invalid_campus_id');
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) throw new Error('invalid_payment_amount');
      if (!validISODate(paymentDate) || (nextBillingDate && !validISODate(nextBillingDate))) throw new Error('invalid_payment_date');
      const { data, error } = await admin.rpc('record_manual_subscription_payment', {
        p_actor_user_id: user.id, p_campus_id: campusId, p_amount_inr: amount,
        p_payment_date: paymentDate, p_next_billing_date: nextBillingDate,
        p_reference: String(payload.reference || '').trim(), p_note: String(payload.note || '').trim()
      });
      if (error) throw new Error(error.message);
      return reply(200, { payment_id: data, recorded: true });
    }

    return fail('That action is not available.', 404);
  } catch (error) {
    const message = errorText(error);
    return fail(friendlyError(message), mapErrorStatus(message));
  }
});
