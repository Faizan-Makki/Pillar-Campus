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

## 3. Create an institute and its Admin

In **Authentication → Users**, invite the institute Admin's email and have them accept the invitation. Then use **SQL Editor** to create the institute:

```sql
insert into public.campuses (name, slug)
values ('Pillar Campus', 'pillar-campus')
returning id;
```

Copy the returned campus ID. Replace the example values below with the Admin's email, campus ID, name, and phone number:

```sql
insert into public.campus_members (user_id, campus_id, display_name, phone, role)
select u.id, 'PASTE-CAMPUS-UUID-HERE', 'Admin name', 'Admin phone', 'admin'
from auth.users u
where lower(u.email) = lower('admin@example.org');
```

## 4. Apply subscriptions and convert Director memberships to Admin

After `schema.sql` and the first institute exist, run [`supabase/migrations/202610210001_pricing_manual_seats.sql`](supabase/migrations/202610210001_pricing_manual_seats.sql), then [`supabase/migrations/202610230001_admin_platform_owner.sql`](supabase/migrations/202610230001_admin_platform_owner.sql) in **SQL Editor**. The second migration copies existing owner IDs into the separate `platform_owners` allowlist and safely changes existing `director` memberships to `admin`. It stops if an institute has multiple active Admin/Director memberships, so you can review that institute before retrying.

The role migration saves exactly which membership rows it converts in `campus_role_migration_backup_20261023`. To roll back before using the new Admin flow, restore only those rows (`admin` back to `director`) from that table, then remove the constraint. The `campus_founders` table remains untouched, so the previous owner allowlist is available if a code rollback is needed.

```sql
begin;
alter table public.campus_members drop constraint if exists campus_members_role_no_director_check;
update public.campus_members m
set role = b.old_role::public.campus_role
from public.campus_role_migration_backup_20261023 b
where m.user_id = b.user_id and m.campus_id = b.campus_id and m.role = 'admin';
commit;
```

One institute Admin account and two Staff seats are included; each extra Staff seat adds ₹99/month. The database locks the subscription row while reserving invitations, so concurrent sends cannot go over the approved limit. A pending invitation reserves one seat until accepted, cancelled, or expired. Supabase's default invite link expires after one hour; keep it at or below one hour to match the reservation window.

## 5. Preserve the Platform Owner account

Platform Owner authority is separate from institute membership. The migration copies active owner accounts from `campus_founders` to `platform_owners` without creating or deleting Auth users. To add or restore your Platform Owner access after your Auth account exists, use SQL Editor and replace the email with the account you control:

```sql
insert into public.platform_owners(user_id, display_name)
select id, 'Pillar Campus Platform Owner'
from auth.users
where lower(email) = lower('YOUR-OWNER-EMAIL')
on conflict (user_id) do update
set active = true, display_name = excluded.display_name;
```

To remove Platform Owner access, deactivate this row in SQL Editor. Do not put owner IDs, credentials, or service keys in browser code. An owner may also have a separate campus membership, but the platform and institute permissions are checked independently.

## 6. Deploy the secure invitation and subscription function

The Edge Function must be deployed before the **Staff** invitation form or Platform Owner overview can work. Install the Supabase CLI if needed, then run these commands from this repository folder:

```text
npx supabase login
npx supabase link --project-ref krguosbdbclqxnaunedg
npx supabase functions deploy campus-admin
```

The function uses Supabase's server-side project URL and secret key environment variables. Do not create a browser-visible secret or commit a service-role key. The Edge Function verifies the signed-in user, then checks the Admin's active campus membership or the Platform Owner allowlist before any protected action.

## 7. Set up invitation email

Staff invitations use Supabase Auth. Configure a verified sender and SMTP provider in **Authentication → SMTP Settings** to send invitations reliably. A verified sender domain is usually required. Supabase's default mailer is intended for limited testing and may not deliver to arbitrary staff addresses. Do not store an SMTP password in the repository; enter it only in Supabase's dashboard secrets/settings.

Invite staff from **Staff → Invite a staff member** after the migration and Edge Function are deployed. Choose a role, name, email, and optional phone. The invitation email asks the staff member to finish signing in; when they return to the app, the invitation securely creates their campus membership. Avoid creating parallel direct invitations in the Supabase dashboard because those do not reserve a Pillar Campus seat.

## 8. Subscription and manual seat limits

The institute Admin's **Plan & staff seats** page displays allowance, active use, pending invitations, remaining seats, and monthly amount. It does not provide seat purchase or payment controls. After receiving payment, the Platform Owner updates `campus_subscriptions.additional_seats` in Supabase SQL, for example:

```sql
update public.campus_subscriptions
set additional_seats = 1
where campus_id = 'PASTE-INSTITUTE-UUID-HERE';
```

The monthly total is calculated automatically as ₹499 + (additional seats × ₹99). Admin invitations are limited by active Staff accounts plus pending invitations.

Pillar Campus has no payment gateway and stores no payment card details. Verify payments outside the app before changing an institute's approved extra-seat count.

## 9. Pilot checklist

1. Apply `schema.sql`, create an Admin and institute, apply both migrations, confirm the Platform Owner row, and deploy the `campus-admin` function.
2. Sign in as Admin. Open **Plan & staff seats**, confirm ₹499/month and two included Staff seats.
3. Invite two fictional Staff accounts; confirm reservations count against the limit, an extra invite is blocked, cancellation releases a seat, and acceptance replaces the reservation.
4. Increase `additional_seats` for a dummy institute in Supabase SQL and confirm the app shows the new approved capacity and monthly total.
5. Sign in with a Platform Owner account and verify the institute overview works without granting that account institute-level access.
6. Test each Staff job role with fictional student data and verify health/fee permissions and cross-institute isolation.

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
