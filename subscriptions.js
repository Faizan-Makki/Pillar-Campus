/* Subscription summary and seat-limited staff invitations. Seat changes are owner-managed in SQL. */
pages.subscriptions = ['Plan & staff seats', 'Approved team size and monthly price'];
pages.platform = ['Institutes', 'Platform-wide institute and subscription overview'];
en.subscriptions = 'Plan & staff seats'; hi.subscriptions = 'प्लान और कर्मचारी'; ur.subscriptions = 'منصوبہ اور عملہ';
en.platform = 'Institutes'; hi.platform = 'संस्थान'; ur.platform = 'ادارے';
for (const [lang, title] of Object.entries({en:'Plan & staff seats',hi:'प्लान और कर्मचारी',ur:'منصوبہ اور عملہ'})) featureTitles[lang].subscriptions = title;
for (const [lang, title] of Object.entries({en:'Institutes',hi:'संस्थान',ur:'ادارے'})) featureTitles[lang].platform = title;
pillarLive.subscriptionSummary = null;
pillarLive.subscriptionError = '';
pillarLive.isPlatformOwner = false;

function liveAdminRequestError(error, data) {
  if (data?.error) return data.error;
  const context = error?.context;
  if (context && typeof context.json === 'function') return context.json().then(body => body?.error || error.message || 'The secure campus service is unavailable.').catch(() => error.message || 'The secure campus service is unavailable.');
  return Promise.resolve(error?.message || 'The secure campus service is unavailable.');
}
async function liveAdminRequest(action, details = {}) {
  if (!pillarLive.client) throw new Error('Sign in to manage staff.');
  const {data, error} = await pillarLive.client.functions.invoke('campus-admin', {body:{action,...details}});
  if (error || data?.error) throw new Error(await liveAdminRequestError(error, data));
  return data || {};
}
function livePrice(amount) { return window.PillarPricing ? PillarPricing.formatInr(Number(amount)||0) : `₹${Number(amount)||0}/month`; }

function liveSubscriptionHomeCard() {
  const summary = pillarLive.subscriptionSummary;
  if (!liveCan('admin')) return '';
  if (!summary) return `<section class="subscription-home-card card"><div><b>Starter plan & staff seats</b><p>${esc(pillarLive.subscriptionError||'Subscription details are unavailable.')}</p></div></section>`;
  const sub = summary.subscription;
  return `<section class="subscription-home-card card"><div class="subscription-home-copy"><span class="status-pill status-ok">Starter · Monthly</span><h3>${livePrice(sub.monthly_total_inr)} <small>manual billing</small></h3><p>${summary.active_staff_used} Staff seats active · ${summary.pending_invitation_count} reserved · ${summary.remaining_seats} available</p></div><div class="subscription-home-copy"><b>1 Admin + ${sub.included_staff_seats} included Staff seats</b><p>${sub.additional_seats} extra seats approved · additional seats ₹${sub.additional_seat_price_inr}/month each</p></div><button class="button button-small button-primary" data-page="subscriptions">View plan</button></section>`;
}
const subscriptionBaseHome = liveRenderHome;
liveRenderHome = function () { return subscriptionBaseHome().replace('<section class="stats-grid">', `${liveSubscriptionHomeCard()}<section class="stats-grid">`); };

function liveRenderSubscriptions() {
  const summary = pillarLive.subscriptionSummary;
  const heading = liveTopHeading('Plan & staff seats','Your approved staff capacity and monthly subscription. Contact the platform owner to request more seats.');
  if (!summary) return `${heading}<section class="card subscription-empty"><h2>Subscription details unavailable</h2><p>${esc(pillarLive.subscriptionError||'Ask the platform owner to check the subscription setup.')}</p></section>`;
  const sub = summary.subscription;
  const invites = (summary.pending_invitations||[]).map(invite => `<div class="invitation-row"><div><b>${esc(invite.display_name)}</b><small>${esc(invite.invited_email)} · ${esc(liveRoleLabel(invite.role))} · Expires ${new Date(invite.expires_at).toLocaleDateString('en-IN')}</small></div><button class="button button-small button-quiet" data-action="revoke-invitation" data-invitation-id="${esc(invite.id)}">Cancel invite</button></div>`).join('')||'<div class="subscription-empty-inline">No invitations are holding seats.</div>';
  return `${heading}<section class="subscription-summary-grid"><article class="card subscription-plan-card"><span class="eyebrow">Starter plan · Monthly</span><strong>${livePrice(sub.monthly_total_inr)}</strong><p>Payments are managed outside the app.</p><div class="plan-points"><div><span>Base price</span><b>${livePrice(sub.base_price_inr)}</b></div><div><span>Included Staff seats</span><b>${sub.included_staff_seats}</b></div><div><span>Approved additional Staff seats</span><b>${sub.additional_seats}</b></div><div><span>Each additional Staff seat</span><b>₹${Number(sub.additional_seat_price_inr).toLocaleString('en-IN')} / month</b></div><div><span>Subscription status</span><b>${esc(sub.subscription_status)}</b></div></div><p class="subscription-note">One institute Admin and two Staff seats are included. The platform owner updates extra seats after payment.</p></article><article class="card subscription-seat-card"><h3>Staff seats</h3><div class="seat-gauge"><strong>${summary.active_staff_used+summary.pending_invitation_count}</strong><span>used or reserved of ${summary.total_staff_allowance}</span></div><div class="seat-breakdown"><div><span>Active Staff accounts</span><b>${summary.active_staff_used}</b></div><div><span>Pending invitations · seats reserved</span><b>${summary.pending_invitation_count}</b></div><div><span>Available</span><b>${summary.remaining_seats}</b></div></div></article></section><section class="card subscription-card"><h3>Pending Staff invitations</h3><p>Each unexpired invitation reserves one seat. Cancelled or expired invitations release it.</p><div class="invitation-list">${invites}</div></section>`;
}

function liveInviteCard() {
  if (!liveCan('admin')) return '';
  const summary = pillarLive.subscriptionSummary;
  if (!summary) return `<section class="card invite-card"><h3>Invite Staff</h3><p>${esc(pillarLive.subscriptionError||'Staff invitation service is not ready.')}</p></section>`;
  const canInvite = summary.remaining_seats > 0;
  return `<section class="card invite-card"><div class="invite-card-heading"><div><h3>Invite a Staff member</h3><p>${canInvite?`${summary.remaining_seats} seat${summary.remaining_seats===1?'':'s'} available. An invitation reserves a seat until accepted, expired, or cancelled.`:'No Staff seats are available. Contact the platform owner to increase the approved limit.'}</p></div><span class="status-pill ${canInvite?'status-ok':'status-info'}">${summary.active_staff_used+summary.pending_invitation_count} / ${summary.total_staff_allowance} used</span></div>${canInvite?`<form class="invite-form" data-staff-invite-form><label class="field"><span>Staff member name</span><input name="display_name" autocomplete="name" required maxlength="120"></label><label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required maxlength="320"></label><label class="field"><span>Phone number (optional)</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40"></label><label class="field"><span>Job role</span><select name="role" required><option value="teacher">Teacher</option><option value="warden">Warden</option><option value="health_worker">Health worker</option><option value="kitchen">Kitchen staff</option><option value="bursar">Bursar</option></select></label><button class="button button-primary" type="submit">Check seat and send invitation</button></form>`:''}</section>`;
}
function liveRenderStaffWithInvites() {
  const summary = pillarLive.subscriptionSummary;
  const heading = liveTopHeading('Our staff <span class="hindi-inline">ہمارا عملہ</span>','Campus contacts used for follow-up and attendance handover.');
  const inviteList = liveCan('admin') && summary ? `<section class="card invitation-admin-card"><h3>Invitations waiting for acceptance</h3>${(summary.pending_invitations||[]).map(invite=>`<div class="invitation-row"><div><b>${esc(invite.display_name)}</b><small>${esc(invite.invited_email)} · ${esc(liveRoleLabel(invite.role))} · Expires ${new Date(invite.expires_at).toLocaleDateString('en-IN')}</small></div><button class="button button-small button-quiet" data-action="revoke-invitation" data-invitation-id="${esc(invite.id)}">Cancel invite</button></div>`).join('')||'<div class="subscription-empty-inline">No pending invitations.</div>'}</section>` : '';
  const people = staffDirectory.length ? table(staffDirectory.map(member=>`<tr><td><div class="student-cell"><span class="student-avatar green">${esc(initials(member.name))}</span><span class="student-meta"><b>${esc(member.name)}</b><small>${esc(member.role)}</small></span></div></td><td>${esc(member.role)}</td><td>${member.phone?`<a class="notification-contact ltr-number" href="tel:${esc(member.phone)}">☎ ${esc(member.phone)}</a>`:'Phone not added'}</td><td>${member.id===pillarLive.member?.id?'<span class="status-pill status-ok">You</span>':'Campus member'}</td></tr>`).join(''),{headers:['Staff member','Role','Phone','Account']}):'<div class="data-empty">No staff accounts are linked yet.</div>';
  return `${heading}${liveInviteCard()}${inviteList}<section class="card table-card"><div class="card-header"><div><h3>Staff contact register <span class="hindi-inline">عملے کے رابطے</span></h3><p>Active campus members and the contacts used in leave follow-up.</p></div></div>${people}<div class="table-footer"><span>One Admin account is included; active Staff accounts use Staff seats.</span></div></section>`;
}
liveRenderStaff = liveRenderStaffWithInvites;

function liveRenderSubscriptionPage() {
  if(currentPage==='platform') {
    if(!pillarLive.isPlatformOwner){currentPage='home';showToast('Platform Owner access is required.');return liveRender();}
    const rows=(pillarLive.platformOwnerSummary||[]).map(row=>`<tr><td><b>${esc(row.campus?.name||'Institute')}</b><small>${esc(row.campus?.slug||'')}</small></td><td>${esc(row.subscription_status||'active')}</td><td>${row.active_staff_used} active + ${row.pending_invitation_count} invited</td><td>${row.total_staff_allowance} Staff seats (${row.included_staff_seats} included + ${row.additional_seats} extra)</td><td>${livePrice(row.monthly_total_inr)}</td><td><code>${esc(row.campus_id)}</code></td></tr>`).join('');
    document.getElementById('contentArea').innerHTML=`${liveTopHeading('Institutes','Platform Owner overview. Institute names and subscription details are loaded from the secure database.',`<button class="button button-quiet" data-action="platform-refresh">Refresh</button>`)}<section class="card table-card"><div class="card-header"><div><h3>Institutes and approved seats</h3><p>Seat increases are applied manually in Supabase SQL after payment.</p></div></div>${table(rows,{headers:['Institute','Status','Staff use','Approved capacity','Monthly total','Campus ID']})}</section><section class="card subscription-card"><h3>Manual seat update</h3><p>Update only the institute’s <code>additional_seats</code> value in <code>public.campus_subscriptions</code>. Monthly total is calculated as ₹499 + (extra seats × ₹99).</p></section>`;
    const crumb=document.getElementById('crumbCurrent');if(crumb)crumb.textContent=featureTitles[currentLanguage]?.platform||'Institutes';
    return true;
  }
  if(currentPage!=='subscriptions') return null;
  if(!liveCan('admin')) { currentPage='home'; showToast('Only your institute Admin can view subscription details.'); return liveRender(); }
  document.getElementById('contentArea').innerHTML=liveRenderSubscriptions();
  const name=featureTitles[currentLanguage]?.[currentPage]||pages[currentPage][0];
  document.getElementById('crumbCurrent').textContent=name;
  document.getElementById('dateLabel').textContent=liveDateLabel();
  return true;
}
const previousLiveRender=liveRender;
liveRender=function(){if(liveRenderSubscriptionPage()===null)return previousLiveRender();};
const previousGo=go;
go=function(page){if(page==='subscriptions'&&!liveCan('admin')){showToast('Only your institute Admin can view subscription details.');return;}if(page==='platform'&&!pillarLive.isPlatformOwner){showToast('Platform Owner access is required.');return;}return previousGo(page);};

function liveShowSubscriptionNav(){const nav=document.getElementById('subscriptionNav');if(nav)nav.hidden=!liveCan('admin');const ownerNav=document.getElementById('platformNav');if(ownerNav)ownerNav.hidden=!pillarLive.isPlatformOwner;}
async function liveLoadSubscriptionAccess(){
  pillarLive.subscriptionSummary=null;pillarLive.subscriptionError='';pillarLive.isPlatformOwner=false;liveShowSubscriptionNav();
  if(liveCan('admin'))try{pillarLive.subscriptionSummary=await liveAdminRequest('admin_summary');}catch(error){pillarLive.subscriptionError=error.message||'Subscription service is not ready.';}
  try{const status=await liveAdminRequest('platform_owner_status');pillarLive.isPlatformOwner=status.role==='platform_owner';if(pillarLive.isPlatformOwner){const data=await liveAdminRequest('platform_owner_summary');pillarLive.platformOwnerSummary=data.institutes||[];}}catch(_){pillarLive.isPlatformOwner=false;pillarLive.platformOwnerSummary=[];}
  liveShowSubscriptionNav();
  if(pillarLive.isPlatformOwner){const role=document.getElementById('sideRole');if(role)role.textContent=liveCan('admin')?'Admin · Platform Owner':'Platform Owner';}
}
const previousLoadWorkspace=liveLoadWorkspace;
liveLoadWorkspace=async function(session){
  if(session&&pillarLive.client)try{await liveAdminRequest('accept_invitation');}catch(error){console.info('Invitation activation will be checked after subscription services are configured.');}
  await previousLoadWorkspace(session);
  if(pillarLive.loaded){await liveLoadSubscriptionAccess();render();}
};
const previousClearPrivateState=liveClearPrivateState;
liveClearPrivateState=function(){previousClearPrivateState();pillarLive.subscriptionSummary=null;pillarLive.subscriptionError='';pillarLive.isPlatformOwner=false;pillarLive.platformOwnerSummary=[];liveShowSubscriptionNav();};
async function liveReloadSubscriptionData(){await liveLoadSubscriptionAccess();if(pillarLive.loaded)try{await liveRefreshData();}catch(_){}render();}

document.addEventListener('click',async event=>{
  const buttonEl=event.target.closest('[data-action]');if(!buttonEl)return;
  if(buttonEl.dataset.action==='platform-refresh'){
    event.preventDefault();event.stopImmediatePropagation();buttonEl.disabled=true;
    try{const data=await liveAdminRequest('platform_owner_summary');pillarLive.platformOwnerSummary=data.institutes||[];render();showToast('Institute overview refreshed.');}
    catch(error){buttonEl.disabled=false;showToast(error.message||'Could not refresh the platform overview.');}
    return;
  }
  if(buttonEl.dataset.action==='revoke-invitation'){
    event.preventDefault();event.stopImmediatePropagation();buttonEl.disabled=true;
    try{await liveAdminRequest('revoke_invitation',{invitation_id:buttonEl.dataset.invitationId});await liveReloadSubscriptionData();showToast('Invitation cancelled; its reserved seat is released.');}
    catch(error){buttonEl.disabled=false;showToast(error.message||'Could not cancel the invitation.');}
  }
},false);
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('[data-staff-invite-form]'))return;
  event.preventDefault();const data=new FormData(form),submit=form.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Checking seat…';
  try{await liveAdminRequest('invite_staff',{display_name:String(data.get('display_name')||'').trim(),email:String(data.get('email')||'').trim(),phone:String(data.get('phone')||'').trim(),role:String(data.get('role')||'')});await liveReloadSubscriptionData();showToast('Invitation sent. One Staff seat is reserved until it is accepted or expires.');}
  catch(error){submit.disabled=false;submit.textContent='Check seat and send invitation';showToast(error.message||'The invitation could not be sent.');}
},true);
