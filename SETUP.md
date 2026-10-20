# Set up the private Pillar Campus database

This guide creates a single-campus pilot for 5–10 staff. The site's files are public, but student records stay in the database behind sign-in and row-level security.

## 1. Create a Supabase project

Create a project in your Supabase account. Select the closest available region, use a strong database password, and keep that password in a password manager. The password is for the Supabase dashboard/database and is never needed by the website.

In **Project Settings → API**, copy the **Project URL** and the **publishable key** (or the legacy `anon` key). Do not use the `secret` or `service_role` key in the website.

## 2. Create the database tables and access rules

Open **SQL Editor**, paste the full contents of [`schema.sql`](schema.sql), and run it. The policies require an active `campus_members` row before a user can read campus data. Health records are available only to the director, admin, and health worker roles. Fee records are available only to the director, admin, and bursar roles.

## 3. Add the first director account

In **Authentication → Users**, invite the director's email address. After the invitation is accepted, use **SQL Editor** to create the campus:

```sql
insert into public.campuses (name, slug)
values ('Pillar Campus', 'pillar-campus')
returning id;
```

Copy the returned campus ID. Then replace the two example values below with the director's email and campus ID:

```sql
insert into public.campus_members (user_id, campus_id, display_name, phone, role)
select u.id, 'PASTE-CAMPUS-UUID-HERE', 'Director name', 'Director phone', 'director'
from auth.users u
where lower(u.email) = lower('director@example.org');
```

The phone number is shown only to signed-in campus members for staff follow-up. Keep it current so overdue leave alerts have a working contact.

## 4. Invite each staff member

Invite one email in **Authentication → Users** for each teacher, warden, health worker, kitchen worker, or bursar. After each invite is accepted, add that user to `campus_members` using this SQL and choose exactly one role: `admin`, `teacher`, `warden`, `health_worker`, `kitchen`, or `bursar`.

```sql
insert into public.campus_members (user_id, campus_id, display_name, phone, role)
select u.id, c.id, 'Staff member name', 'Staff phone', 'warden'
from auth.users u
join public.campuses c on c.slug = 'pillar-campus'
where lower(u.email) = lower('staff@example.org');
```

Disable public sign-ups in **Authentication → Settings** after the director and staff accounts are invited. Keep at least one director/admin account active.

## 5. Connect the website

Edit `supabase-config.js` in the repository and set the URL and publishable key from step 1:

```js
window.PILLAR_SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  publishableKey: "YOUR-PUBLISHABLE-KEY"
};
```

The publishable key is intended to appear in browser code; row-level security protects the data. Never paste the database password or a `secret` / `service_role` key into this file. Save the change to `main`; GitHub Pages publishes the update. Set the Supabase **Site URL** and allowed redirect URL to the final GitHub Pages address so password reset links return to the app.

## 6. First-use checklist

1. Sign in as the director and create fictional students, attendance, leave, stock, and health data.
2. Sign in with one account for each role. Confirm health and fee pages are denied to roles that should not see them.
3. Check that the attendance list follows the roll numbers in the paper register and that overdue leave phone links dial the expected contact.
4. Print a sample question paper to A4 and confirm the two copies fit on one sheet.
5. Only after those checks, enter real student details. Use the Supabase dashboard's backup/export options and confirm that a backup can be restored.

The app does not send email invites itself, create staff accounts, or send SMS/WhatsApp alerts. Account invitations and role assignment stay with the campus administrator in Supabase.
