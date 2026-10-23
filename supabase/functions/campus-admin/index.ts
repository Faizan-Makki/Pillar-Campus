import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const STAFF_ROLES = new Set(['teacher', 'warden', 'health_worker', 'kitchen', 'bursar']);
const PAGE_URL = 'https://faizan-makki.github.io/Pillar-Campus/';

function keyFromEnv(jsonName: string, legacyNames: string[]): string {
  const packed = Deno.env.get(jsonName);
  if (packed) try { const values=JSON.parse(packed) as Record<string,string>; const key=values.default||Object.values(values)[0]; if(key)return key; } catch { /* check the legacy env vars below */ }
  for (const name of legacyNames) { const key=Deno.env.get(name); if(key)return key; }
  throw new Error(`Missing required Supabase function key: ${jsonName}`);
}
const supabaseUrl=Deno.env.get('SUPABASE_URL');
if(!supabaseUrl)throw new Error('SUPABASE_URL is not available in this function environment.');
const publishableKey=keyFromEnv('SUPABASE_PUBLISHABLE_KEYS',['SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEY']);
const secretKey=keyFromEnv('SUPABASE_SECRET_KEYS',['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY']);
const service=createClient(supabaseUrl,secretKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});

function reply(status:number,body:Record<string,unknown>):Response{return new Response(JSON.stringify(body),{status,headers:corsHeaders});}
function fail(message:string,status=400):Response{return reply(status,{error:message});}
function messageOf(error:unknown):string{return error instanceof Error?error.message:String(error||'Request failed.');}
function statusOf(message:string):number{
  if(/admin_required|platform_owner_required|not authorized/i.test(message))return 403;
  if(/seat_limit_reached|invitation_already_pending|staff_account_already_linked/i.test(message))return 409;
  if(/invalid_|too_long/i.test(message))return 400;
  return 500;
}
function friendly(message:string):string{
  if(/seat_limit_reached/i.test(message))return 'All approved Staff seats are in use. Contact the platform owner to update the limit after payment.';
  if(/invitation_already_pending/i.test(message))return 'An invitation for this email is already pending.';
  if(/staff_account_already_linked/i.test(message))return 'This account is already linked to an active institute. Ask its Admin to manage access.';
  if(/admin_required/i.test(message))return 'Only the institute Admin can manage Staff invitations.';
  if(/platform_owner_required/i.test(message))return 'Platform Owner access is required for this action.';
  if(/invalid_email/i.test(message))return 'Enter a valid email address.';
  if(/invalid_display_name/i.test(message))return 'Enter a Staff name between 2 and 120 characters.';
  if(/invalid_phone/i.test(message))return 'The phone number is too long.';
  if(/invalid_staff_role/i.test(message))return 'Choose an available Staff job role.';
  if(/email invite could not be sent/i.test(message))return message;
  if(/invitation_reservation_expired/i.test(message))return 'The invitation reservation expired. Please send a new invitation.';
  return 'The secure campus service could not complete this action. Refresh and try again.';
}

async function authenticatedUser(request:Request):Promise<{user:User;client:SupabaseClient}> {
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))throw new Response(JSON.stringify({error:'Sign in again to continue.'}),{status:401,headers:corsHeaders});
  const client=createClient(supabaseUrl!,publishableKey,{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw new Response(JSON.stringify({error:'Your sign-in has expired. Please sign in again.'}),{status:401,headers:corsHeaders});
  return {user:data.user,client};
}
async function requireAdmin(userId:string):Promise<{id:string;campus_id:string;display_name:string}> {
  const {data,error}=await service.from('campus_members').select('id,campus_id,display_name,role,active').eq('user_id',userId).eq('active',true).eq('role','admin').maybeSingle();
  if(error)throw new Error(error.message);if(!data)throw new Error('admin_required');return data;
}
async function requirePlatformOwner(userId:string):Promise<void> {
  const {data,error}=await service.from('platform_owners').select('user_id').eq('user_id',userId).eq('active',true).maybeSingle();
  if(error)throw new Error(error.message);if(!data)throw new Error('platform_owner_required');
}
async function expireInvitations():Promise<void>{const {error}=await service.rpc('expire_staff_invitations');if(error)throw new Error(error.message);}

async function adminSummary(member:{campus_id:string}) {
  await expireInvitations();
  const [subscription,members,invitations]=await Promise.all([
    service.from('campus_subscriptions').select('*').eq('campus_id',member.campus_id).maybeSingle(),
    service.from('campus_members').select('role').eq('campus_id',member.campus_id).eq('active',true),
    service.from('staff_invitations').select('id,invited_email,display_name,role,status,expires_at,invited_at,created_at').eq('campus_id',member.campus_id).order('created_at',{ascending:false})
  ]);
  for(const result of [subscription,members,invitations])if(result.error)throw new Error(result.error.message);
  const plan=subscription.data;if(!plan)throw new Error('subscription_not_configured');
  const roles=(members.data||[]).map(row=>row.role);
  const activeStaffUsed=Math.max(0,roles.length-Math.min(roles.filter(role=>role==='admin').length,1));
  const pending=(invitations.data||[]).filter(row=>row.status==='pending'&&Date.parse(row.expires_at)>Date.now());
  const allowance=plan.included_staff_seats+plan.additional_seats;
  return {subscription:plan,active_staff_used:activeStaffUsed,pending_invitations:pending,pending_invitation_count:pending.length,total_staff_allowance:allowance,remaining_seats:Math.max(0,allowance-activeStaffUsed-pending.length),server_time:new Date().toISOString()};
}

async function platformOwnerSummary() {
  await expireInvitations();
  const [subscriptions,campuses,members,invitations]=await Promise.all([
    service.from('campus_subscriptions').select('campus_id,monthly_total_inr,additional_seats,included_staff_seats,subscription_status').order('updated_at',{ascending:false}),
    service.from('campuses').select('id,name,slug'),
    service.from('campus_members').select('campus_id,role').eq('active',true),
    service.from('staff_invitations').select('campus_id,expires_at').eq('status','pending')
  ]);
  for(const result of [subscriptions,campuses,members,invitations])if(result.error)throw new Error(result.error.message);
  const names=new Map((campuses.data||[]).map(row=>[row.id,{id:row.id,name:row.name,slug:row.slug}]));
  return (subscriptions.data||[]).map(plan=>{
    const roles=(members.data||[]).filter(row=>row.campus_id===plan.campus_id).map(row=>row.role);
    const used=Math.max(0,roles.length-Math.min(roles.filter(role=>role==='admin').length,1));
    const reserved=(invitations.data||[]).filter(row=>row.campus_id===plan.campus_id&&Date.parse(row.expires_at)>Date.now()).length;
    return {campus_id:plan.campus_id,campus:names.get(plan.campus_id)||{name:'Institute',slug:''},monthly_total_inr:plan.monthly_total_inr,additional_seats:plan.additional_seats,included_staff_seats:plan.included_staff_seats,subscription_status:plan.subscription_status,total_staff_allowance:plan.included_staff_seats+plan.additional_seats,active_staff_used:used,pending_invitation_count:reserved};
  });
}

async function inviteStaff(user:User,payload:Record<string,unknown>) {
  await requireAdmin(user.id);
  const email=String(payload.email||'').trim().toLowerCase(),displayName=String(payload.display_name||'').trim(),phone=String(payload.phone||'').trim(),role=String(payload.role||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>320)throw new Error('invalid_email');
  if(displayName.length<2||displayName.length>120)throw new Error('invalid_display_name');
  if(phone.length>40)throw new Error('invalid_phone');
  if(!STAFF_ROLES.has(role))throw new Error('invalid_staff_role');
  const {data:reservation,error:reserveError}=await service.rpc('reserve_staff_invitation',{p_actor_user_id:user.id,p_email:email,p_display_name:displayName,p_phone:phone,p_role:role});
  if(reserveError)throw new Error(reserveError.message);
  const {data:invited,error:inviteError}=await service.auth.admin.inviteUserByEmail(email,{data:{display_name:displayName},redirectTo:PAGE_URL});
  if(inviteError||!invited.user?.id){await service.rpc('fail_staff_invitation',{p_actor_user_id:user.id,p_invitation_id:reservation.invitation_id,p_reason:inviteError?.message||'Supabase did not return an invited user.'});throw new Error('Email invite could not be sent. The reserved Staff seat has been released. Check SMTP settings and try again.');}
  const {error:finishError}=await service.rpc('finish_staff_invitation',{p_actor_user_id:user.id,p_invitation_id:reservation.invitation_id,p_auth_user_id:invited.user.id});
  if(finishError)throw new Error('The invitation email was sent but its seat could not be linked. Do not resend; ask the Platform Owner to review it.');
  return {invitation_id:reservation.invitation_id,invited:true,reserved_seats:reservation.reserved,remaining_seats:Math.max(0,reservation.allowance-reservation.used-reservation.reserved)};
}

Deno.serve(async(request:Request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST')return fail('Use a signed-in Pillar Campus session to continue.',405);
  let identity:{user:User;client:SupabaseClient};let payload:Record<string,unknown>;
  try{identity=await authenticatedUser(request);payload=await request.json();if(!payload||typeof payload!=='object'||Array.isArray(payload))return fail('Invalid request.',400);}
  catch(error){if(error instanceof Response)return error;return fail('Could not read your request.',400);}
  const {user}=identity;const action=String(payload.action||'');
  try{
    if(action==='accept_invitation'){const {data,error}=await service.rpc('accept_staff_invitation',{p_user_id:user.id});if(error)throw new Error(error.message);return reply(200,data||{accepted:false});}
    if(action==='admin_summary')return reply(200,await adminSummary(await requireAdmin(user.id)));
    if(action==='invite_staff')return reply(200,await inviteStaff(user,payload));
    if(action==='revoke_invitation'){
      await requireAdmin(user.id);const id=String(payload.invitation_id||'');if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('invalid_invitation_id');
      const {error}=await service.rpc('revoke_staff_invitation',{p_actor_user_id:user.id,p_invitation_id:id,p_reason:'Cancelled by institute Admin'});if(error)throw new Error(error.message);return reply(200,{revoked:true});
    }
    if(action==='platform_owner_status'){await requirePlatformOwner(user.id);return reply(200,{role:'platform_owner'});}
    if(action==='platform_owner_summary'){await requirePlatformOwner(user.id);return reply(200,{institutes:await platformOwnerSummary()});}
    return fail('That action is not available.',404);
  }catch(error){if(error instanceof Response)return error;const message=messageOf(error);return fail(friendly(message),statusOf(message));}
});
