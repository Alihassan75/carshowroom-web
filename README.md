# The Lot: showroom control, on Supabase

A car showroom dashboard (cars, rentals, invoices, customers, payroll, expenses, dealers, leads, documents, targets, profit, activity trail, backup) with a public catalog for customers.

This folder is the same app you used on Claude, moved onto **your own Supabase project** so the data, logins and photos belong to you.

```
supabase/schema.sql              database, login roles, security rules, realtime, photo storage
supabase/functions/ask-ai/       server piece that lets the AI desk use Claude without exposing your key
web/index.html                   the owner and staff dashboard
web/catalog.html                 the public page customers open (live, with photos and test-drive requests)
web/shim.js                      connects the dashboard to Supabase (login, data, photos, downloads, AI)
web/config.js                    YOUR Supabase address and public key go here
tools/import-backup.mjs          moves your existing data from the Claude version into Supabase
sample-data/sample-backup.json   made-up cars, staff, invoices and so on, to try the app (import it with the tool above)
```

## What you need

- A free Supabase account (supabase.com).
- A place to host the `web` folder. Netlify, Cloudflare Pages or Vercel all work, and Netlify lets you drag the folder in.
- Optional, for the AI desk: an Anthropic API key (console.anthropic.com).
- Optional: Node 18+ and the Supabase CLI, only for the AI function and the data import.

## Setup, about 20 minutes

### 1. Create the project
In Supabase choose **New project**. Save the database password somewhere safe.

### 2. Create the tables and security
Open **SQL Editor, New query**, paste all of `supabase/schema.sql`, press **Run**. It is safe to run twice.

### 3. Turn off public sign-ups (important)
**Authentication, Sign In / Providers (or Settings), Email**: switch **off** "Allow new users to sign up".
Without this, a stranger could create an account and read your showroom data.

### 4. Create your login
**Authentication, Users, Add user, Create new user.** Enter your email and a strong password, and tick "Auto Confirm User".
The first user ever created becomes the **owner** automatically. Every user added after that is **staff**.

### 5. Add staff and set their level
Add each person the same way (Authentication, Users, Add user). Then, in the SQL Editor, set who is an admin:

```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'manager@example.com');
```

| Role | Can see and change |
|---|---|
| owner, admin | everything, including payroll, expenses, attendance, dealers, profit, activity trail, targets, backups |
| staff | cars, invoices, customers, leads, records. Not payroll, expenses, attendance, dealers or profit |

To change a person's display name: `update public.profiles set name = 'Ahmed Raza' where id = (...);`

### 6. Connect the web app
In Supabase open **Project Settings, API**. Copy the **Project URL** and the **anon public key** into `web/config.js`.
The anon key is designed to be public. **Never** put the `service_role` key in the `web` folder.

### 7. Host the `web` folder
Upload the contents of `web` (index.html, catalog.html, shim.js, config.js) to your host.
- Dashboard: `https://your-site/` (index.html)
- Customer catalog: `https://your-site/catalog.html` (share this link and print its QR stickers from the dashboard)

In Supabase, **Authentication, URL Configuration**, set the Site URL to your hosted address.

### 8. Optional: switch on the AI desk
```
npm i -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy ask-ai
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key
```
`ANTHROPIC_MODEL` is optional (default `claude-sonnet-4-6`). Check the current model names in Anthropic's documentation and set a newer one if you prefer.
Only signed-in staff can call the function. Each question costs a small amount on your Anthropic account.

### 9. Move your existing data
In the Claude version open **Records, Download full backup**, then on your computer:
```
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node tools/import-backup.mjs showroom-backup-2026-10-30.json --dry-run
```
Remove `--dry-run` to really import. The service role key is in Project Settings, API, and must stay on your computer.
The activity trail and car photos are not carried over. Add the photos again from each car.

## How the data is stored

Each kind of record (cars, invoices, staff and so on) is one row in `showroom_docs` holding a JSON list. This kept the app exactly as you tested it. It is comfortable for a single showroom with a few thousand records per list. Each list is saved as a whole, so two people saving the same list in the same second can overwrite one another (the last save wins). The activity trail is the exception: one row per change, in `activity`.

When you outgrow this, the next step is proper tables (one row per car, invoice, and so on) with the dashboard calling them directly. The JSON backup is your way out and in.

## Security notes

- Row Level Security is on for every table. The rules are in `schema.sql` and were tested: staff cannot read payroll, anonymous visitors cannot read any table, and visitors can only add enquiries.
- `public_catalog` and `public_shop` expose only make, model, year, price, rent, photos and your showroom name, address and phone. They never show buying cost or plates.
- Enquiries from the catalog arrive in the dashboard as leads. A bot could flood that form. For a busy site turn on Supabase CAPTCHA protection or rate limits.
- Car photos are in a public bucket so the catalog can show them. Do not upload papers or ID cards there.
- Supabase's database linter may warn about "security definer" views. Here it is deliberate: it is how customers see the catalog without seeing your tables.

## Urdu

Both the dashboard and the catalog have a language button (اردو / English). The choice is saved on each person's own device, and the screen switches to right-to-left. Fixed screen text is translated. Your own data (customer names, notes, car names) is shown as typed.
Not translated yet: the login screen, PDFs (invoices, statements, QR stickers use English letters only), and a few long sentences built from live numbers. All Urdu wording is in one list at the top of the script in `web/index.html` (and `web/catalog.html`), named `UR`, so a staff member can correct any word in one place.

## Known limits

- A record list is saved whole (see above), and there is no offline mode.
- No automatic WhatsApp or SMS. The dashboard prepares the message and you press send.
- PDFs use English letters only. Urdu names and Urdu screen text will not print correctly on invoices yet.
- Realtime sync needs the connection open. The app also refreshes when you return to the tab.
