/* Director seat requests, invitation UI, and founder-only manual subscription controls. */
pages.subscriptions = ['Plan & staff seats', 'Starter plan, team access, and monthly price'];
pages.founder = ['Subscription & Seat Requests', 'Founder-only manual subscription management'];
en.subscriptions = 'Plan & staff seats'; hi.subscriptions = 'प्लान और कर्मचारी'; ur.subscriptions = 'پلان اور عملے کی نشستیں';
en.founder = 'Subscription & Seat Requests'; hi.founder = 'प्लान और सीट अनुरोध'; ur.founder = 'سبسکرپشن اور نشستوں کی درخواستیں';
for (const [lang, title] of Object.entries({en:'Plan & staff seats',hi:'प्लान और कर्मचारी',ur:'پلان اور عملے کی نشستیں'})) featureTitles[lang].subscriptions = title;
for (const [lang, title] of Object.entries({en:'Subscription & Seat Requests',hi:'प्लान और सीट अनुरोध',ur:'سبسکرپشن اور نشستوں کی درخواستیں'})) featureTitles[lang].founder = title;
featureSubtitles.en = {subscriptions:'Included staff seats, additional seat requests, and manual billing status.',founder:'Review requests and manage approved seats and recorded payments.'};
featureSubtitles.hi = {...featureSubtitles.hi,subscriptions:'शामिल कर्मचारी सीटें, अतिरिक्त सीट अनुरोध और भुगतान की स्थिति।',founder:'अनुरोध देखें और स्वीकृत सीटें तथा दर्ज भुगतान प्रबंधित करें।'};
featureSubtitles.ur = {...featureSubtitles.ur,subscriptions:'شامل عملے کی نشستیں، اضافی نشستوں کی درخواستیں اور دستی ادائیگی کی کیفیت۔',founder:'درخواستیں دیکھیں اور منظور شدہ نشستوں اور ادائیگیوں کا انتظام کریں۔'};

pillarLive.subscriptionSummary = null;
pillarLive.subscriptionError = '';
pillarLive.founderSnapshot = null;
pillarLive.isFounder = false;

function liveAdminRequestError(error, data) {
  if (data?.error) return data.error;
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    return context.json().then(body => body?.error || error.message || 'The secure campus service is unavailable.').catch(() => error.message || 'The secure campus service is unavailable.');
  }
  return Promise.resolve(error?.message || 'The secure campus service is unavailable.');
}

async function liveAdminRequest(action, details = {}) {
  if (!pillarLive.client) throw new Error('Sign in to manage staff seats.');
  const {data, error} = await pillarLive.client.functions.invoke('campus-admin', {body:{action,...details}});
  if (error || data?.error) throw new Error(await liveAdminRequestError(error, data));
  return data || {};
}

function livePrice(amount) {
  return window.PillarPricing ? PillarPricing.formatInr(Number(amount)||0) : `₹${Number(amount)||0}/month`;
}

function liveLocal(english, hindi, urdu) {
  return currentLanguage === 'ur' ? urdu : currentLanguage === 'hi' ? hindi : english;
}

function liveSubscriptionHomeCard() {
  const summary = pillarLive.subscriptionSummary;
  if (!liveCan('director')) return '';
  if (!summary) return `<section class="subscription-home-card card"><div><b>Starter plan & staff seats</b><p>${esc(pillarLive.subscriptionError||'Subscription tools are being prepared for this campus.')}</p></div><button class="button button-small button-quiet" data-page="subscriptions">Open plan</button></section>`;
  const sub = summary.subscription;
  return `<section class="subscription-home-card card"><div class="subscription-home-copy"><span class="status-pill status-ok">Starter · Monthly</span><h3>${livePrice(sub.monthly_total_inr)} <small>manually managed</small></h3><p>${summary.active_staff_used} active staff seats · ${summary.pending_invitation_count} reserved · ${summary.remaining_seats} available</p></div><div class="subscription-home-copy"><b>${sub.included_staff_seats} included + ${sub.additional_seats} approved extra</b><p>More seats cost ${livePrice(sub.additional_seat_price_inr).replace('/month','')} each per month.</p></div><button class="button button-small button-primary" data-page="subscriptions">Manage seats</button></section>`;
}

const subscriptionBaseHome = liveRenderHome;
liveRenderHome = function () {
  return subscriptionBaseHome().replace('<section class="stats-grid">', `${liveSubscriptionHomeCard()}<section class="stats-grid">`);
};

function liveRequestStatus(status) {
  return `<span class="subscription-status ${esc(status)}">${esc(status.replaceAll('_',' '))}</span>`;
}

function liveRenderSubscriptions() {
  const summary = pillarLive.subscriptionSummary;
  const heading = liveTopHeading(liveLocal('Plan & staff seats','प्लान और कर्मचारी','پلان اور عملے کی نشستیں'),liveLocal('See the approved team size, monthly price, and any pending requests.','स्वीकृत टीम आकार, मासिक कीमत और लंबित अनुरोध देखें।','منظور شدہ ٹیم، ماہانہ قیمت اور زیرِ التوا درخواستیں دیکھیں۔'));
  if (!summary) return `${heading}<section class="card subscription-empty"><h2>Subscription tools need setup</h2><p>${esc(pillarLive.subscriptionError||'The secure subscription service has not been deployed for this campus yet.')}</p><p>Once the database migration and campus-admin function are installed, this page will show seats, invitations, and requests.</p></section>`;
  const sub = summary.subscription;
  const requests = (summary.requests||[]).map(request => `<article class="request-row"><div class="request-main"><div><b>${Number(request.requested_quantity)} additional seat${Number(request.requested_quantity)===1?'':'s'} requested</b><small>${esc(request.reason||'No reason added')} · ${new Date(request.created_at).toLocaleDateString('en-IN')}</small></div>${liveRequestStatus(request.status)}</div><p>Requested total: ${Number(request.proposed_additional_quantity)} extra seat${Number(request.proposed_additional_quantity)===1?'':'s'} · ${livePrice(request.proposed_monthly_total_inr)}</p>${request.director_message?`<small class="director-message">${esc(request.director_message)}</small>`:''}${request.status==='pending'?`<button class="button button-small button-quiet" data-action="cancel-seat-request" data-request-id="${esc(request.id)}">Cancel request</button>`:''}</article>`).join('')||'<div class="subscription-empty-inline">No additional seat requests yet.</div>';
  const invites = (summary.pending_invitations||[]).map(invite => `<div class="invitation-row"><div><b>${esc(invite.display_name)}</b><small>${esc(invite.invited_email)} · ${esc(liveRoleLabel(invite.role))} · Expires ${new Date(invite.expires_at).toLocaleDateString('en-IN')}</small></div><button class="button button-small button-quiet" data-action="revoke-invitation" data-invitation-id="${esc(invite.id)}">Cancel invite</button></div>`).join('')||'<div class="subscription-empty-inline">No invitations are holding seats.</div>';
  const requestForm = summary.requests?.some(request=>request.status==='pending')
    ? `<div class="subscription-callout"><b>A seat request is already under review.</b><span>You can cancel it below if your needs change.</span></div>`
    : `<form class="seat-request-form" data-seat-request-form><h3>Request additional seats</h3><p>Approval will update your limit after review. This form does not charge or change your current access.</p><label class="field"><span>How many extra staff seats do you need?</span><input name="quantity" type="number" min="1" max="100" step="1" value="1" required data-request-quantity></label><label class="field"><span>Reason (optional)</span><textarea name="reason" maxlength="1000" placeholder="For example, one new teacher and a hostel warden"></textarea></label><div class="price-preview"><span>Seats after approval</span><b id="requestSeatTotal">${sub.included_staff_seats+sub.additional_seats+1} total staff seats</b><span>Proposed monthly amount</span><b id="requestMonthlyTotal">${livePrice(Number(sub.base_price_inr)+(Number(sub.additional_seats)+1)*Number(sub.additional_seat_price_inr))}</b></div><button class="button button-primary" type="submit">Request additional seats</button></form>`;
  return `${heading}<section class="subscription-summary-grid"><article class="card subscription-plan-card"><span class="eyebrow">Starter plan · Monthly</span><strong>${livePrice(sub.monthly_total_inr)}</strong><p>Manual billing · no automatic charge</p><div class="plan-points"><div><span>Base price</span><b>${livePrice(sub.base_price_inr)}</b></div><div><span>Included staff seats</span><b>${sub.included_staff_seats}</b></div><div><span>Additional seats approved</span><b>${sub.additional_seats}</b></div><div><span>Each additional seat</span><b>₹${Number(sub.additional_seat_price_inr).toLocaleString('en-IN')} / month</b></div><div><span>Subscription status</span><b>${esc(sub.subscription_status)}</b></div><div><span>Billing status</span><b>${esc(sub.billing_status.replaceAll('_',' '))}</b></div><div><span>Next billing date</span><b>${sub.next_billing_date?esc(sub.next_billing_date):'Not set'}</b></div><div><span>Effective date</span><b>${sub.billing_start_date?esc(sub.billing_start_date):'Not set'}</b></div></div><p class="subscription-note">Pricing formula: ₹499 + (approved extra seats × ₹99). The director account is included; other active accounts and pending invitations use staff seats.</p></article><article class="card subscription-seat-card"><h3>Staff seats</h3><div class="seat-gauge"><strong>${summary.active_staff_used+summary.pending_invitation_count}</strong><span>used or reserved of ${summary.total_staff_allowance}</span></div><div class="seat-breakdown"><div><span>Active staff accounts</span><b>${summary.active_staff_used}</b></div><div><span>Pending invitations · seats reserved</span><b>${summary.pending_invitation_count}</b></div><div><span>Available</span><b>${summary.remaining_seats}</b></div></div>${summary.remaining_seats===0?`<div class="seat-limit-note">You've used all staff seats included in your plan. Additional seats cost ₹99 per user per month. Request more seats here; your limit changes only after approval.</div>`:''}</article></section><section class="subscription-content-grid"><article class="card subscription-card">${requestForm}<div class="request-history"><h3>Request history</h3>${requests}</div></article><article class="card subscription-card"><h3>Pending staff invitations</h3><p>Each unexpired invitation reserves one staff seat. Expired or cancelled invitations release it.</p><div class="invitation-list">${invites}</div></article></section>`;
}

function liveInviteCard() {
  if (!liveCan('director')) return '';
  const summary = pillarLive.subscriptionSummary;
  if (!summary) return `<section class="card invite-card"><h3>Invite staff</h3><p>${esc(pillarLive.subscriptionError||'The secure invite service needs setup before staff can be added here.')}</p><button class="button button-small button-quiet" data-page="subscriptions">View plan setup</button></section>`;
  const canInvite = summary.remaining_seats > 0;
  return `<section class="card invite-card"><div class="invite-card-heading"><div><h3>Invite a staff member</h3><p>${canInvite?`${summary.remaining_seats} seat${summary.remaining_seats===1?'':'s'} available. The invitation reserves a seat until accepted, expired, or cancelled.`:'No staff seats are available. Request additional seats before sending another invitation.'}</p></div><span class="status-pill ${canInvite?'status-ok':'status-info'}">${summary.active_staff_used+summary.pending_invitation_count} / ${summary.total_staff_allowance} used</span></div>${canInvite?`<form class="invite-form" data-staff-invite-form><label class="field"><span>Staff member name</span><input name="display_name" autocomplete="name" required maxlength="120"></label><label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required maxlength="320"></label><label class="field"><span>Phone number (optional)</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40"></label><label class="field"><span>Campus role</span><select name="role" required><option value="teacher">Teacher</option><option value="warden">Warden</option><option value="health_worker">Health worker</option><option value="kitchen">Kitchen staff</option><option value="bursar">Bursar</option><option value="admin">Campus admin · uses a staff seat</option></select></label><button class="button button-primary" type="submit">Check seat and send invitation</button></form>`:`<div class="seat-limit-note">${summary.remaining_seats===0?"You've used all staff seats included in your plan. Additional seats cost ₹99 per user per month. Contact Pillar Campus to request more seats. Your limit will be updated after approval.":'A staff invitation cannot be sent while all seats are in use.'}</div><button class="button button-primary" data-page="subscriptions">Request additional seats</button>`}</section>`;
}

function liveRenderStaffWithInvites() {
  const summary = pillarLive.subscriptionSummary;
  const heading = liveTopHeading('Our staff <span class="hindi-inline">ہمارا عملہ</span>','Campus contacts used for follow-up and attendance handover.');
  const inviteList = liveCan('director') && summary ? `<section class="card invitation-admin-card"><h3>Invitations waiting for acceptance</h3>${(summary.pending_invitations||[]).map(invite=>`<div class="invitation-row"><div><b>${esc(invite.display_name)}</b><small>${esc(invite.invited_email)} · ${esc(liveRoleLabel(invite.role))} · Expires ${new Date(invite.expires_at).toLocaleDateString('en-IN')}</small></div><button class="button button-small button-quiet" data-action="revoke-invitation" data-invitation-id="${esc(invite.id)}">Cancel invite</button></div>`).join('')||'<div class="subscription-empty-inline">No pending invitations.</div>'}</section>` : '';
  const people = staffDirectory.length ? table(staffDirectory.map(member=>`<tr><td><div class="student-cell"><span class="student-avatar green">${esc(initials(member.name))}</span><span class="student-meta"><b>${esc(member.name)}</b><small>${esc(member.role)}</small></span></div></td><td>${esc(member.role)}</td><td>${member.phone?`<a class="notification-contact ltr-number" href="tel:${esc(member.phone)}">☎ ${esc(member.phone)}</a>`:'Phone not added'}</td><td>${member.id===pillarLive.member.id?'<span class="status-pill status-ok">You</span>':'Campus member'}</td></tr>`).join(''),{headers:['Staff member','Role','Phone','Account']}):'<div class="data-empty">No staff accounts are linked yet.</div>';
  return `${heading}${liveInviteCard()}${inviteList}<section class="card table-card"><div class="card-header"><div><h3>Staff contact register <span class="hindi-inline">عملے کے رابطے</span></h3><p>Active campus members and the contacts used in leave follow-up.</p></div></div>${people}<div class="table-footer"><span>One Director/Admin account is included; other accounts use staff seats.</span></div></section>`;
}
liveRenderStaff = liveRenderStaffWithInvites;

function liveRenderFounder() {
  const snapshot = pillarLive.founderSnapshot;
  const heading = liveTopHeading('Subscription & Seat Requests','Founder-only review of plans, seat limits, and manually recorded payments.',`<button class="button button-quiet" data-action="founder-refresh">Refresh</button>`);
  if (!pillarLive.isFounder) return `${heading}<section class="card subscription-empty"><h2>Founder access required</h2><p>This page is available only to the account configured in the Supabase founder list.</p></section>`;
  if (!snapshot) return `${heading}<section class="card subscription-empty"><h2>Subscription data unavailable</h2><p>${esc(pillarLive.subscriptionError||'Refresh after the database migration and Edge Function are deployed.')}</p></section>`;
  const totalInstitutions = snapshot.campuses.length;
  const pendingRequests = snapshot.requests.filter(request=>request.status==='pending');
  const awaitingPayment = snapshot.campuses.filter(campus=>campus.billing_status==='awaiting_payment'||campus.billing_status==='overdue').length;
  const requestCards = pendingRequests.map(request=>{
    const campus = snapshot.campuses.find(row=>row.campus_id===request.campus_id);
    const extra = Number(request.proposed_additional_quantity);
    const price = Number(request.proposed_monthly_total_inr);
    const searchText = `${campus?.campus?.name||''} ${campus?.campus?.slug||''}`.toLowerCase();
    return `<article class="founder-request-card card" data-campus-search="${esc(searchText)}"><div class="founder-request-title"><div><span class="eyebrow">${esc(campus?.campus?.name||'Campus')}</span><h3>${Number(request.requested_quantity)} extra seat${Number(request.requested_quantity)===1?'':'s'} requested</h3><p>${esc(request.reason||'No reason supplied')}</p></div>${liveRequestStatus(request.status)}</div><div class="request-proposal"><span>Current approved extra seats <b>${Number(request.current_approved_quantity)}</b></span><span>Proposed extra seats <b>${extra}</b></span><span>Proposed monthly price <b>${livePrice(price)}</b></span><span>Current staff usage <b>${campus?.active_staff_used||0} active · ${campus?.pending_invitation_count||0} pending</b></span></div><form class="founder-resolution-form" data-resolve-seat-form data-request-id="${esc(request.id)}" data-base-price="${Number(campus?.base_price_inr||499)}" data-price-per-seat="${Number(campus?.additional_seat_price_inr||99)}" data-included-seats="${Number(campus?.included_staff_seats||2)}"><label class="field"><span>Final approved additional seats</span><input name="approved_additional_quantity" type="number" min="0" max="1000" step="1" value="${extra}" required></label><label class="field"><span>Agreed billing start date</span><input name="billing_start_date" type="date"></label><label class="field"><span>Message visible to director</span><input name="director_message" maxlength="1000" placeholder="Optional approval or rejection note"></label><label class="field"><span>Internal founder note</span><input name="internal_note" maxlength="2000" placeholder="Optional internal record"></label><div class="approval-preview"><span>Final allowance: <b data-final-allowance>${Number(campus?.included_staff_seats||2)+extra}</b> staff seats</span><span>Monthly amount: <b data-final-price>${livePrice(Number(campus?.base_price_inr||499)+extra*Number(campus?.additional_seat_price_inr||99))}</b></span></div><div class="founder-actions"><button class="button button-primary" name="decision" value="approved">Approve seats</button><button class="button button-quiet" name="decision" value="rejected">Reject request</button></div></form></article>`;
  }).join('') || '<div class="subscription-empty-inline">No seat requests are waiting for review.</div>';
  const campusCards = snapshot.campuses.map(campus=>{
    const invites = (campus.pending_invitations||[]).map(invite=>`<div class="compact-row"><span>${esc(invite.display_name)} · ${esc(liveRoleLabel(invite.role))}</span><small>${esc(invite.invited_email)} · reserved</small></div>`).join('')||'<p class="muted-small">No reserved invitations.</p>';
    const paymentRows = snapshot.payments.filter(payment=>payment.campus_id===campus.campus_id).slice(0,3).map(payment=>`<div class="compact-row"><span>${livePrice(Number(payment.amount_inr)).replace('/month','')} · ${esc(payment.payment_date)}</span><small>${esc(payment.reference||payment.note||'Manual entry')}</small></div>`).join('')||'<p class="muted-small">No payments recorded.</p>';
    return `<article class="founder-campus-card card" data-campus-search="${esc(`${campus.campus?.name||''} ${campus.campus?.slug||''}`.toLowerCase())}"><div class="founder-campus-header"><div><h3>${esc(campus.campus?.name||'Campus')}</h3><small>${esc(campus.campus?.slug||'')}</small></div><span class="status-pill status-info">${esc(campus.subscription_status)}</span></div><div class="founder-campus-facts"><div><span>Current monthly amount</span><b>${livePrice(campus.monthly_total_inr)}</b></div><div><span>Staff seats active</span><b>${campus.active_staff_used} / ${campus.total_staff_allowance}</b></div><div><span>Invitations reserving seats</span><b>${campus.pending_invitation_count}</b></div><div><span>Billing status</span><b>${esc(campus.billing_status.replaceAll('_',' '))}</b></div><div><span>Next billing date</span><b>${campus.next_billing_date?esc(campus.next_billing_date):'Not set'}</b></div><div><span>Effective date</span><b>${campus.billing_start_date?esc(campus.billing_start_date):'Not set'}</b></div></div><details class="founder-details"><summary>Pending invitations and recent payments</summary><h4>Pending invitations</h4>${invites}<h4>Recent manual payments</h4>${paymentRows}</details><form class="founder-campus-form" data-adjust-seats-form data-campus-id="${esc(campus.campus_id)}" data-current-seats="${Number(campus.additional_seats)}" data-monthly-total="${Number(campus.monthly_total_inr)}"><h4>Adjust approved extra seats</h4><div class="founder-form-grid"><label class="field"><span>Approved additional seats</span><input name="additional_seats" type="number" min="0" max="1000" step="1" value="${Number(campus.additional_seats)}" required></label><label class="field"><span>Effective date</span><input name="effective_date" type="date" required></label></div><label class="field"><span>Reason (required for audit)</span><input name="reason" maxlength="2000" required></label><div class="approval-preview"><span>New monthly amount</span><b data-adjust-price>${livePrice(Number(campus.monthly_total_inr))}</b></div><button class="button button-quiet" type="submit">Save seat limit</button></form><form class="founder-campus-form payment-form" data-record-payment-form data-campus-id="${esc(campus.campus_id)}"><h4>Record a verified manual payment</h4><p>Enter only after payment has actually been received and checked. This does not collect or store card data.</p><div class="founder-form-grid"><label class="field"><span>Amount received (₹)</span><input name="amount_inr" type="number" min="1" max="10000000" step="1" value="${Number(campus.monthly_total_inr)}" required></label><label class="field"><span>Payment date</span><input name="payment_date" type="date" value="${liveToday()}" required></label><label class="field"><span>Next billing date (optional)</span><input name="next_billing_date" type="date"></label><label class="field"><span>Receipt / reference (optional)</span><input name="reference" maxlength="200"></label></div><label class="field"><span>Note (optional)</span><input name="note" maxlength="1000"></label><button class="button button-primary" type="submit">Record manual payment</button></form></article>`;
  }).join('') || '<div class="subscription-empty-inline">No campus subscriptions yet.</div>';
  const history = snapshot.audit.map(row=>`<tr><td>${esc(row.created_at?.slice(0,10)||'')}</td><td>${esc(snapshot.campuses.find(c=>c.campus_id===row.campus_id)?.campus?.name||'—')}</td><td>${esc(row.action.replaceAll('_',' '))}</td><td>${esc(row.reason||'—')}</td><td>${esc(JSON.stringify(row.new_state||{}))}</td></tr>`).join('')||'<tr><td colspan="5">No subscription changes recorded yet.</td></tr>';
  return `${heading}<section class="report-grid founder-summary-stats">${stat('Institutions',String(totalInstitutions),'Starter plan accounts','⌂')}${stat('Requests waiting',String(pendingRequests.length),'Manual approval required','↗')}${stat('Billing needs follow-up',String(awaitingPayment),'Awaiting payment or overdue','₹')}</section><section class="card founder-search-card"><label class="search-box"><span>⌕</span><input id="founderSearch" type="search" placeholder="Search institution name"></label></section><section class="founder-section"><h2>Pending seat requests <span>${pendingRequests.length}</span></h2>${requestCards}</section><section class="founder-section"><h2>Institutions and subscriptions</h2><div class="founder-campus-grid">${campusCards}</div></section><section class="card table-card audit-card"><div class="card-header"><div><h3>Subscription and payment history</h3><p>Founder-only audit trail; internal notes stay hidden from directors.</p></div></div>${table(history,{headers:['Date','Institution','Action','Reason','Change']})}</section>`;
}

function liveRenderSubscriptionPage() {
  if (currentPage === 'subscriptions') {
    if (!liveCan('director')) { currentPage='home'; showToast('Only the campus director can manage the subscription.'); return liveRender(); }
    document.getElementById('contentArea').innerHTML = liveRenderSubscriptions();
  } else if (currentPage === 'founder') {
    if (!pillarLive.isFounder) { currentPage='home'; showToast('This founder page is restricted.'); return liveRender(); }
    document.getElementById('contentArea').innerHTML = liveRenderFounder();
  } else return null;
  const name = featureTitles[currentLanguage]?.[currentPage] || pages[currentPage][0];
  document.getElementById('crumbCurrent').textContent = name;
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.classList.toggle('active',item.dataset.page===currentPage);
    const label=item.querySelector('.nav-copy b');
    if(label&&featureTitles[currentLanguage]?.[item.dataset.page])label.textContent=featureTitles[currentLanguage][item.dataset.page];
  });
  document.getElementById('dateLabel').textContent=liveDateLabel();
  return true;
}
const previousLiveRender = liveRender;
liveRender = function () { if (liveRenderSubscriptionPage() === null) return previousLiveRender(); };

const previousGo = go;
go = function(page) {
  if (page==='subscriptions'&&!liveCan('director')) { showToast('Only the campus director can manage the subscription.'); return; }
  if (page==='founder'&&!pillarLive.isFounder) { showToast('This founder page is restricted.'); return; }
  return previousGo(page);
};

function liveShowSubscriptionNav() {
  const subscriptionNav=document.getElementById('subscriptionNav');
  const founderNav=document.getElementById('founderNav');
  if(subscriptionNav)subscriptionNav.hidden=!liveCan('director');
  if(founderNav)founderNav.hidden=!pillarLive.isFounder;
}

async function liveLoadSubscriptionAccess() {
  pillarLive.subscriptionSummary=null;
  pillarLive.subscriptionError='';
  pillarLive.founderSnapshot=null;
  pillarLive.isFounder=false;
  liveShowSubscriptionNav();
  const jobs=[];
  if(liveCan('director')) jobs.push((async()=>{
    try { pillarLive.subscriptionSummary=await liveAdminRequest('director_summary'); }
    catch(error){pillarLive.subscriptionError=error.message||'Subscription service is not ready.';}
  })());
  jobs.push((async()=>{
    try { pillarLive.founderSnapshot=await liveAdminRequest('founder_snapshot');pillarLive.isFounder=true; }
    catch(error){if(!/founder/i.test(error.message||''))console.warn('Pillar founder controls are unavailable:',error.message);}
  })());
  await Promise.all(jobs);
  liveShowSubscriptionNav();
}

const previousLoadWorkspace = liveLoadWorkspace;
liveLoadWorkspace = async function(session) {
  if (session && pillarLive.client) {
    try { await liveAdminRequest('accept_invitation'); }
    catch(error) { console.info('Invitation activation will be checked after subscription services are configured.'); }
  }
  await previousLoadWorkspace(session);
  if (pillarLive.loaded) { await liveLoadSubscriptionAccess(); render(); }
};

const previousClearPrivateState = liveClearPrivateState;
liveClearPrivateState = function() {
  previousClearPrivateState();
  pillarLive.subscriptionSummary=null;pillarLive.subscriptionError='';pillarLive.founderSnapshot=null;pillarLive.isFounder=false;
  liveShowSubscriptionNav();
};

async function liveReloadSubscriptionData() {
  await liveLoadSubscriptionAccess();
  if (pillarLive.loaded) { try { await liveRefreshData(); } catch (_) {} }
  render();
}

document.addEventListener('input',event=>{
  const quantity=event.target.closest('[data-request-quantity]');
  if(quantity){
    const summary=pillarLive.subscriptionSummary;if(!summary)return;
    const add=Math.max(0,Math.min(100,Number(quantity.value)||0)),sub=summary.subscription;
    const seats=document.getElementById('requestSeatTotal'),price=document.getElementById('requestMonthlyTotal');
    if(seats)seats.textContent=`${Number(sub.included_staff_seats)+Number(sub.additional_seats)+add} total staff seats`;
    if(price)price.textContent=livePrice(Number(sub.base_price_inr)+(Number(sub.additional_seats)+add)*Number(sub.additional_seat_price_inr));
  }
  const approval=event.target.closest('[data-resolve-seat-form]');
  if(approval){
    const extra=Math.max(0,Math.min(1000,Number(approval.elements.approved_additional_quantity.value)||0));
    const included=Number(approval.dataset.includedSeats),base=Number(approval.dataset.basePrice),rate=Number(approval.dataset.pricePerSeat);
    const allow=approval.querySelector('[data-final-allowance]'),price=approval.querySelector('[data-final-price]');
    if(allow)allow.textContent=String(included+extra);if(price)price.textContent=livePrice(base+extra*rate);
  }
  const adjust=event.target.closest('[data-adjust-seats-form]');
  if(adjust&&event.target.name==='additional_seats'){
    const seats=Math.max(0,Math.min(1000,Number(event.target.value)||0));
    const base=Number(adjust.dataset.monthlyTotal)-Number(adjust.dataset.currentSeats)*99;
    const target=adjust.querySelector('[data-adjust-price]');if(target)target.textContent=livePrice(base+seats*99);
  }
  if(event.target.id==='founderSearch'){
    const query=event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-campus-search]').forEach(card=>{card.hidden=!card.dataset.campusSearch.includes(query)});
  }
},true);

document.addEventListener('click',async event=>{
  const buttonEl=event.target.closest('[data-action]');if(!buttonEl)return;
  const action=buttonEl.dataset.action;
  if(action==='cancel-seat-request'||action==='revoke-invitation'||action==='founder-refresh'){
    event.preventDefault();event.stopImmediatePropagation();buttonEl.disabled=true;
    try{
      if(action==='cancel-seat-request')await liveAdminRequest('cancel_seat_request',{request_id:buttonEl.dataset.requestId});
      else if(action==='revoke-invitation')await liveAdminRequest('revoke_invitation',{invitation_id:buttonEl.dataset.invitationId});
      await liveReloadSubscriptionData();
      showToast(action==='cancel-seat-request'?'Seat request cancelled.':action==='revoke-invitation'?'Invitation cancelled; its reserved seat is released.':'Subscription data refreshed.');
    }catch(error){buttonEl.disabled=false;showToast(error.message||'Could not update subscription details.');}
  }
},false);

document.addEventListener('submit',async event=>{
  const form=event.target;
  if(form.matches('[data-seat-request-form]')){
    event.preventDefault();const data=new FormData(form),quantity=Number(data.get('quantity'));
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{await liveAdminRequest('request_seats',{quantity,reason:String(data.get('reason')||'').trim()});await liveReloadSubscriptionData();showToast('Seat request sent to Pillar Campus. Your current limit is unchanged.');}
    catch(error){submit.disabled=false;showToast(error.message||'Could not send the seat request.');}
    return;
  }
  if(form.matches('[data-staff-invite-form]')){
    event.preventDefault();const data=new FormData(form),submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Checking seat…';
    try{await liveAdminRequest('invite_staff',{display_name:String(data.get('display_name')||'').trim(),email:String(data.get('email')||'').trim(),phone:String(data.get('phone')||'').trim(),role:String(data.get('role')||'')});await liveReloadSubscriptionData();showToast('Invitation sent. One staff seat is reserved until the invitation is accepted or expires.');}
    catch(error){submit.disabled=false;submit.textContent='Check seat and send invitation';showToast(error.message||'The invitation could not be sent.');}
    return;
  }
  if(form.matches('[data-resolve-seat-form]')){
    event.preventDefault();const decision=event.submitter?.value||'approved',data=new FormData(form),requestId=form.dataset.requestId;
    if(decision==='approved'&&!window.confirm('Approve this seat limit? This changes the recurring monthly amount from the agreed billing start date. It will not charge the institution.'))return;
    if(decision==='rejected'&&!window.confirm('Reject this additional-seat request? The director will see the status and message.'))return;
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(btn=>btn.disabled=true);
    try{await liveAdminRequest('resolve_seat_request',{request_id:requestId,decision,approved_additional_quantity:String(data.get('approved_additional_quantity')||''),billing_start_date:String(data.get('billing_start_date')||''),director_message:String(data.get('director_message')||'').trim(),internal_note:String(data.get('internal_note')||'').trim()});await liveReloadSubscriptionData();showToast(decision==='approved'?'Seat request approved. No payment was collected.':'Seat request rejected; the decision was saved.');}
    catch(error){buttons.forEach(btn=>btn.disabled=false);showToast(error.message||'Could not resolve the seat request.');}
    return;
  }
  if(form.matches('[data-adjust-seats-form]')){
    event.preventDefault();const data=new FormData(form),additional=Number(data.get('additional_seats'));
    const sub=pillarLive.founderSnapshot?.campuses.find(row=>row.campus_id===form.dataset.campusId);
    const newTotal=window.PillarPricing.monthlyTotal(additional,Number(sub?.base_price_inr||499),Number(sub?.additional_seat_price_inr||99));
    if(!window.confirm(`Set this institution to ${Number(sub?.included_staff_seats||2)+additional} total staff seats at ${livePrice(newTotal)}? No charge will be collected.`))return;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{await liveAdminRequest('adjust_seats',{campus_id:form.dataset.campusId,additional_seats:additional,effective_date:String(data.get('effective_date')||''),reason:String(data.get('reason')||'').trim()});await liveReloadSubscriptionData();showToast('Approved seat limit updated and audited. No payment was collected.');}
    catch(error){submit.disabled=false;showToast(error.message||'Could not update the approved seat limit.');}
    return;
  }
  if(form.matches('[data-record-payment-form]')){
    event.preventDefault();const data=new FormData(form),amount=Number(data.get('amount_inr'));
    if(!window.confirm(`Record ₹${amount.toLocaleString('en-IN')} as received and verified for this institution? This records the manual payment; it does not collect money.`))return;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{await liveAdminRequest('record_payment',{campus_id:form.dataset.campusId,amount_inr:amount,payment_date:String(data.get('payment_date')||''),next_billing_date:String(data.get('next_billing_date')||''),reference:String(data.get('reference')||'').trim(),note:String(data.get('note')||'').trim()});await liveReloadSubscriptionData();showToast('Verified manual payment recorded.');}
    catch(error){submit.disabled=false;showToast(error.message||'Could not record the payment.');}
  }
},true);
