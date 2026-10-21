# Set up Pillar Campus

This guide configures the private pilot for a small school, coaching centre, madarsa, or hostel. The website files are public; campus records stay in Supabase behind sign-in and row-level security.

## 1. Supabase project and browser settings

Create a Supabase project in a nearby region. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy `anon` key). The publishable key is meant for browser use. Never copy a database password, `secret` key, or `service_role` key into the website or GitHub.

Set the URL and publishable key in `supabase-config.js`:

```js
window.PILLAR_SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  publishableKey: "YOUR-PUBLISHABLE-KEY"
};
```

In **Authentication → URL Configuration**, set the Site URL to the published site and add the same GitHub Pages URL under Redirect URLs. For the current project, the app address is `https://faizan-makki.github.io/Pillar-Campus/`.

## 2. Create the original campus schema

Open **SQL Editor**, paste the full contents of [`schema.sql`](schema.sql), and run it. This sets up campus, membership, student and register tables plus the existing role-based access rules.

## 3. Create the first Director and campus

In **Authentication → Users**, invite the first Director's email and have them accept the invitation. Then use **SQL Editor** to create the campus:

```sql
insert into public.campuses (name, slug)
values ('Pillar Campus', 'pillar-campus')
returning id;
```

Copy the returned campus ID. Replace the example values below with the Director's email, campus ID, name, and phone number:

```sql
insert into public.campus_members (user_id, campus_id, display_name, phone, role)
select u.id, 'PASTE-CAMPUS-UUID-HERE', 'Director name', 'Director phone', 'director'
from auth.users u
where lower(u.email) = lower('director@example.org');
```

## 4. Apply the subscription and seat-management migration

After `schema.sql` and the first campus exist, run [`supabase/migrations/202610210001_pricing_manual_seats.sql`](supabase/migrations/202610210001_pricing_manual_seats.sql) in **SQL Editor**. It creates a ₹499/month Starter subscription with two included staff seats for existing campuses, and automatically adds the same subscription to new campuses. It preserves existing campus and student rows.

The Director/Admin account is included. Two staff seats are included; each approved additional seat adds ₹99/month. The SQL locks the campus subscription row while reserving invitations, so concurrent sends cannot go over the limit. A pending invitation reserves one seat until it is accepted, cancelled, or expires. Supabase's default invite link expires after one hour; if you change the Auth email-link expiry, keep it at or below one hour to match the reservation window.

## 5. Configure the founder account

The founder is not a browser-selected role. Only an active user ID in `campus_founders` can use founder controls; founder records are unreadable and uneditable by ordinary signed-in users. Add the founder after their Auth account exists, replacing the email with an account you control:

```sql
insert into public.campus_founders(user_id, display_name)
select id, 'Pillar Campus Founder'
from auth.users
where lower(email) = lower('YOUR-FOUNDER-EMAIL')
on conflict (user_id) do update
set active = true, display_name = excluded.display_name;
```

To remove founder access, deactivate the row in SQL Editor. Do not put founder IDs, credentials, or service keys in browser code. The founder account can also be the initial campus Director; the authorities are checked separately on the server.

## 6. Deploy the secure invitation and subscription function

The Edge Function must be deployed before the **Staff** invitation form, seat requests, founder approvals, or manually recorded payments can work. Install the Supabase CLI if needed, then run these commands from this repository folder:

```text
npx supabase login
npx supabase link --project-ref krguosbdbclqxnaunedg
npx supabase functions deploy campus-admin
```

The function uses Supabase's server-side project URL and secret key environment variables. Do not create a browser-visible secret or commit a service-role key. The Edge Function verifies the signed-in user, then checks the Director's active campus membership or the founder allowlist before any protected action.

## 7. Set up invitation email

Staff invitations use Supabase Auth. Configure a verified sender and SMTP provider in **Authentication → SMTP Settings** to send invitations reliably. A verified sender domain is usually required. Supabase's default mailer is intended for limited testing and may not deliver to arbitrary staff addresses. Do not store an SMTP password in the repository; enter it only in Supabase's dashboard secrets/settings.

Invite staff from **Staff → Invite a staff member** after the migration and Edge Function are deployed. Choose a role, name, email, and optional phone. The invitation email asks the staff member to finish signing in; when they return to the app, the invitation securely creates their campus membership. Avoid creating parallel direct invitations in the Supabase dashboard because those do not reserve a Pillar Campus seat.

## 8. Subscription and manual payment rules

The Director's **Plan & staff seats** page displays allowance, active use, pending invitations, remaining seats, monthly amount, billing status, and request history. Additional seats only become available after a founder approves the request. The founder uses **Subscription & Seat Requests** to review requests, set the final approved quantity and billing start date, record a decision, or adjust a seat limit manually. Each change is audited.

Pillar Campus currently has no payment gateway. The founder can record a payment only after receiving and verifying it outside the app. Recording a payment updates the manual billing status; it does not collect money, charge a card, prorate, or send an automated renewal. No payment-provider credentials are needed.

## 9. Pilot checklist

1. Apply `schema.sql`, create the Director and campus, apply the subscription migration, configure the founder, and deploy the `campus-admin` function.
2. Sign in as Director. Open **Plan & staff seats**, confirm ₹499/month and two included seats, then request additional seats. The request must not change the allowance.
3. Sign in as founder. Approve with a billing start date, then check that the subscription total and audit history changed. Reject a second request and confirm the Director sees the rejected status.
4. Invite two fictional staff accounts. Confirm invitations reserve seats; try one more and confirm it is blocked. Cancel an invite and confirm its seat is released. Accept one invite and confirm the active membership replaces the reservation.
5. Record a fictional verified manual payment only in a test campus. Confirm the billing status and payment history; no payment is collected by the app.
6. Test each staff role with fictional student data. Confirm health notes and family fee records are visible only to authorised roles before entering real records.

## 10. Test and build checks

The repository's test suite uses only Node's built-in test runner. From the project folder:

```text
npm test
```

The security-contract tests inspect migration and Edge Function safeguards, and pricing tests cover the shared seat and rupee calculations. They do not replace an integration test against a deployed Supabase project; use the pilot checklist above for that final check.

## Pilot boundaries

- The app is intended for an initial 5–10 user pilot. Use fictional records to confirm each role before adding real student information.
- Health notes and fee records have narrower access than the general campus register.
- The app does not send SMS or WhatsApp alerts. Overdue leave notices link to the saved phone number for a phone call.
- Review the current Supabase plan limits, backups, and retention settings. Confirm you can restore an export before relying on the service for long-term records.
- Serve the website over HTTPS. For a local preview, serve this folder over HTTP (for example, `python -m http.server 8000`); do not open `index.html` as a `file://` URL.
