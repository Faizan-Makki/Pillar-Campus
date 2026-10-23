# Pillar Campus

Mobile-first management for a school, coaching centre, madarsa, or hostel. The app includes the roll-order attendance register, morning/evening hostel attendance, student and guardian records, leave follow-up, health notes, kitchen stock, fees, staff contacts, dashboard graphs, Urdu/Hindi labels, and an A4 question-paper maker with two copies per sheet.

## Private pilot setup

The site is login-first. It displays no sample students or campus data until a signed-in user is connected to a campus. To run a real 5–10 person pilot, finish the Supabase setup in [SETUP.md](SETUP.md), then publish the static site from this repository with GitHub Pages.

The database schema in [schema.sql](schema.sql) enables row-level security for each campus. Health notes and fee records have narrower role access. Accounts are invitation-only and linked to one campus by a campus administrator. The browser uses only the Supabase publishable key; never commit a secret/service-role key.

## Deploy to GitHub Pages

In the repository, open **Settings → Pages** and set the publishing source to **Deploy from a branch**, choose **main** and **/(root)**, then save. GitHub Pages serves this static site directly from the repository root. See [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Pilot boundaries

- This is a small-team web app intended for an initial 5–10 staff pilot. Test staff roles and data access with fictional records before using live student information.
- Supabase Free currently includes 500 MB per project but can pause projects after one week of inactivity and does not include automatic backups. Set up a backup routine and review current plan limits before relying on it for long-term records.
- The app does not send SMS or WhatsApp messages. Overdue leave notifications show the recorded guardian/staff phone as a tap-to-call link.
- Authentication uses email and password. Each institute Admin invites Staff from **Staff**; every invitation reserves a seat and is sent through Supabase Auth. There is no public sign-up link. Apply both migrations and deploy the secure `campus-admin` Edge Function as described in [SETUP.md](SETUP.md) before inviting staff.
- Starter costs ₹499/month and includes one institute Admin plus two Staff seats. Additional Staff seats cost ₹99 per user per month. The Platform Owner updates extra seat capacity manually in Supabase SQL after payment; the app does not collect or charge payments.
- Use HTTPS. Keep the publishable key in `supabase-config.js`; do not place database passwords, API secret keys, or service-role keys in any browser file.

## Local preview

Serve the `pillar-campus` folder over HTTP (for example, `python -m http.server 8000`) and open the returned local address. Do not open the HTML directly as a `file://` URL; browser authentication needs a web origin.
