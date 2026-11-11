# AAFE Gala — Backend

The Supabase project (stable, below) serves all three apps: the staff app, the sponsor portal and the iPad check-in app. Each app calls its own functions; no app writes tables directly.

```
Give Lively ──(every 15 min)──▶ givelively-sync ──▶ gl_import() ──┐
Staff CSV upload ─────────────▶ staff_import_givelively() ─────────┤
                                                                   ▼
Sponsor portal ──anon key──▶ portal_* functions ──▶  Postgres (schema.sql + backend.sql)  ◀── staff_* functions ◀── Staff app (sign-in)
                                                                   ▲  │
iPad check-in (sign-in) ── door_sync(), staff_sync_check_ins() ────┘  ├─ email_log drafts ─staff approve─▶ send-emails ──▶ Resend ──▶ sponsor / guest
                                                                      └─ Sync now ─▶ salesforce-push ──▶ Salesforce (a stand-in in the demo)
```

| File | What it is |
|---|---|
| `database/backend.sql` | Security (RLS), Guest Portal API, Staff App API, Give Lively import, email queue. Run after `schema.sql` + `seed.sql`. Safe to re-run. |
| `database/cron.sql` | Five schedules (pg_cron + pg_net): the Give Lively poll every 15 minutes, the email sender every minute, and three daily jobs: the schedule's own run history cleanup (08:30 UTC), the staff app sync's week-old deleted-row markers (`sync_prune`, 08:45), and the retention sweep (09:15). Run it with `scripts/setup-cron.mjs` (Setup step 4), which fills in its two values. |
| `supabase/functions/givelively-sync` | Polls Give Lively's Zapier JSON endpoint and imports gala purchases. What it does with each donation is in `_shared/givelively-sync.ts`, so Node can test it. |
| `supabase/functions/send-emails` | Sends **staff-approved** emails (guest-list links, reminders, payment confirmations, QR invitations) through Resend. Unapproved drafts never send (hard rule 4). |
| `supabase/functions/salesforce-push` | Sends the gala's sponsors, orders, payments and guests to Salesforce (gala admins' **Sync now**). What it sends is in `_shared/salesforce.ts`. See "Demo with a stand-in Salesforce". |
| `supabase/functions/salesforce-mock` + `database/demo_salesforce.sql` | **Demo only.** A stand-in Salesforce org that keeps what it receives in `demo_salesforce_records`. |
| `supabase/functions/_shared/emails.ts` | The wording of every email (subject and HTML), as plain functions. `send-emails` uses them to send; the staff app can use the same ones to preview a draft before approving it. |
| `supabase/functions/givelively-mock` + `database/demo_givelively.sql` | **Demo only.** A fake Give Lively account with synthetic purchases. |
| `supabase/functions/_shared/givelively.ts` | Maps a Give Lively donation to our row shape and filters out non-gala donations. |
| `scripts/test-*.mjs` and `.mts`: the 29 that `test:backend` in `package.json` lists, in order | `npm run test:backend`, no Supabase account needed. Among what they cover: the database and demo flows; the access rules for every table, view and function against every kind of caller, plus the sponsor link's limits; each one-time database upgrade run once and recorded, on a fresh database, an old one that still needs it, and one that had it before the record existed (Gate 1, box 7); payment confirmations, reminders, the approval queue and the email wording; a change-log entry for every staff action (a new staff function fails until it is listed there); offline check-in end to end, with two iPads checking in the same guest; the sponsor pipeline from prospect to payment; sponsor-facing arrivals off and on; food and access answers deleted after the gala with only their totals kept, counted as the staff app counts them; guests' contact details deleted after the gala, every copy, by a gala admin or 60 days on by the daily job, with names and sponsors' details kept; a full-size invented gala (553 guests, 2026-shaped) through the import into the database; the Give Lively mapping; and what the Give Lively sync does with each donation, run against `gl_import()` (other campaigns, unsettled payments, unreadable rows, re-polls that must not double anything); and the staff app's sync, `staff_sync()`: only what changed, deleted rows as tombstones, each role's access rules, everything again after a gala change or a prune; and the iPad's door list by changes, `door_sync()`: a list merged from its answers equals a fresh `staff_checkin_snapshot()` after a check-in at another door, an undo, a sponsor renamed, a table renumbered, a walk-in, a guest removed and an order cancelled; and the money rules for every order of all three demo sets (Gate 1): paid never negative, nothing owed on a cancelled or comp order, the status agreeing with the money, each payment's amounts adding up, and the portal, the reports and the payments all counting the same, before and after payments, a cancellation, an oversized refund and new level prices; and the demo-data drift check (Gate 1, box 6): each set loaded twice is the same data, and the check finds a level marked as coming with a table that doesn't, a past gala's level at this year's price, a check-in, a removed row, an edited name or change-log line, and a field the project doesn't have yet; and Natalie's invented 2027 export end to end (its two gala pages, an unknown fee kept unknown until the sync reports it, every wallet named); and both AAFE-shaped exports saved in Excel (Gate 1, box 3): each Excel copy imports exactly as the clean file, adds nothing uploaded after it, and the copy whose names Excel damaged stops the upload with nothing written; and voiding a check, ACH or wire entered by mistake (`test-void-payment.mjs`, #236). `scripts/test-db.mjs` is their shared in-memory database setup. Any failed check fails the run. |
| `scripts/load-checkin.mjs` | **Gala-night load test** (Gate 3, run by hand, needs Docker). Six iPads check in the full 553-guest demo gala at once, while two staff tabs (a gala admin, a relationship manager) keep their copy with `staff_sync()` and two iPad door lists keep theirs with `door_sync()`, on a real Postgres 17: some sync in small batches, two after a long offline stretch, one resends a batch, some guests arrive at two doors. It fails if a check-in is lost or doubled, the first arrival doesn't win, a seat doesn't follow, any item is refused, or a staff tab's copy or a door list differs from a fresh load. `node scripts/load-checkin.mjs` (add `--seed N` for another shuffle, `--two-doors 0.5` for a harder race). The CI tests can't race: PGlite has one connection. |

## Setup

Where every key lives, and what stops a secret from reaching the browser or the repo: [`docs/keys-and-secrets.md`](../../docs/keys-and-secrets.md). In short, only the project URL and the anon key ever go in an app's `.env.local`; the service_role key stays in Supabase.

Run every command below from `prototype/`.

1. **Database.** Supabase dashboard → SQL editor: run `database/schema.sql`, then `seed.sql`, then `backend.sql`.
   **AAFE's real project** instead: `schema.sql`, then `backend.sql`, then `start-levels-2026.sql` (the 2026 gala and its levels, and 2027 in planning; no people or money), and none of the seeds or `demo_*.sql` files. The database refuses to mix demo and real galas.
   Or from the command line, with the Supabase CLI this folder installs (`npm ci`, then `npx supabase …`):
   ```bash
   npx supabase login                                   # opens the browser once
   npx supabase link --project-ref <PROJECT-REF>        # press Enter at the database password prompt
   npx supabase db query --linked -f database/schema.sql
   npx supabase db query --linked -f database/seed.sql
   npm run db:backend                                   # backend.sql; safe to re-run after every change to it
   npm run db:advisors                                  # Supabase's security and performance checks
   ```
   The advisor should show one warning, about `staff_role()`: the access rules call it directly, so it stays in `public`. Every other function the apps call lives in the `private` schema, which Supabase's API doesn't expose, behind a `public` wrapper with the same name and grants (`backend.sql`, section 10). Add a new app function to the grant lists as usual; the wrapper is made for it.
   **Database upgrades are recorded** (Gate 1, box 7). `backend.sql` runs again after every change, so a one-time change to data already in a database is written as a step, `if upgrade_step('YYYY-MM-DD what', 'why') then ... end if` inside a `do` block, and `schema_upgrades` keeps one row per step a database has had. It runs once and is never decided by "does this column exist yet"; a step that fails isn't recorded, so it runs when fixed. A database that already had a step when it first met the table (stable, Oct 18) records it as done without running it (`ran` false). Shape changes stay as statements that are safe to repeat (`add column if not exists`, indexes, constraints), and what each run does to freshly loaded demo data (hashing seed tokens, moving QR codes to seats) keeps following the data. `select * from schema_upgrades order by id;` shows a project's history.
   **Updating a project that already runs:** `npm run db:backend` first, then `npm run db:load` if you reload demo data, then upload the apps. The seeds and the apps expect the newest `backend.sql` (for example the per-gala sponsorship levels of Oct 14: an older database has no `sponsorship_tiers.event_id` until `backend.sql` adds it).
   `db query --linked` goes through your Supabase login, so no database password is needed or stored. `supabase link` keeps its state in `supabase/.temp/`, which git ignores.
   **Switch demo data sets** (decided Oct 7): `npm run db:load -- small`, `full-as-sent` or `full-fixed`. It **replaces** the demo data in the linked project with that set, in one transaction: it refuses if any gala is not marked synthetic (and the database itself refuses a real gala in a project that holds demo galas, or the reverse: demo and real data never share a project), keeps the staff list (test sign-in emails survive) and each gala's Give Lively page name (Pull now needs it), then re-runs `backend.sql`. The staff app and portal have the same switch on their prototype banner (saved in the browser). Change the sets in `database/generate_seed.py` and `generate_full_seed.py` (`npm run seed`), never in the seed files.
   **Check a project's demo data against its set** (Gate 1, box 6): `npm run db:drift -- full-fixed` (or `small`, `full-as-sent`). Read-only. It loads the set the way `db:load` does into an in-memory Postgres, reads the same twelve tables from the linked project, and compares them row by row and field by field. It prints what differs: rows added or missing, fields changed with both values, and fields only one side has (the project's `backend.sql` is older or newer than your checkout's). It exits 1 on any difference. It sets aside only what a load doesn't take from the set: the staff list and the gala's Give Lively page name (kept on purpose), the times and pipeline ids `backend.sql` stamps at load, and each row's transaction number. Run it from the checkout whose `backend.sql` the project runs; `npm run db:load` makes a project match again.
2. **Staff logins.** Authentication → Sign In / Providers: "Allow new users to sign up" decides who can get a first code. **Off**: only people whose login was made in the dashboard (below). **On**, for sign-in by email domain (below): first set Authentication → Auth Hooks → **Before User Created** → Postgres → `public.hook_staff_signup`, which refuses a new login for anyone not on the staff list or at a domain in `staff_join_domains`. Never turn sign-ups on without the hook: anyone could then have the project send sign-in emails. Authentication → Emails → **Magic Link** template: under the link, add `<p>Or type this code: <strong>{{ .Token }}</strong></p>`, and the same line in **Confirm signup** (a first sign-in uses it). Staff can then type the 6-digit code instead of opening the link: it signs in wherever they typed it, which the iPad's Home Screen app needs (its storage is separate from Safari), and a link only works in the browser that asked for it. To test a role without email, a one-time link made with Supabase's admin tools works too: `<app address>/?token_hash=<hashed_token>&type=<verification_type>` (`signInFromLink()` in `shared/src/supabase.ts`). Authentication → Users → **Add user** for each staff member, with the exact email in `staff_users` and **Auto Confirm User** ticked: with sign-ups off, an unconfirmed account can't get a code (with sign-ups on and the hook set, their first code makes the login). Login is matched to the role by email. Demo seed emails are `@aafe-demo.example.org`, so change them to real team inboxes (`update staff_users set email = ...`) to test. Then copy `staff-app/.env.example` to `staff-app/.env.local` with the project URL and anon key: the Staff App's login page switches from demo accounts to an emailed 6-digit code, and an email not in `staff_users` is signed straight back out. Authentication → URL Configuration: add each app's address to the redirect URLs, on your laptop (e.g. `http://localhost:5174/` for the staff app, `http://localhost:5175/` for the iPad app) and deployed (`https://aafe-gala-staff.pages.dev/`, `https://aafe-gala-checkin.pages.dev/`). The iPad app takes the same two settings in `checkin-app/.env.local` (`checkin-app/.env.example`); see `checkin-app/README.md`.
   **Add a staff member** in three steps: in the SQL editor, `insert into staff_users (id, name, email, role) values ('st-…', 'Name', 'their@email', 'relationship_manager');` (roles: `gala_admin`, `relationship_manager`, `check_in_volunteer`); Authentication → Users → Add user with the same email, confirmed (with sign-ups off, an unconfirmed account can't get a code); and, only for an address outside @aafe.org and @pursuit.org, add it to the Cloudflare Access policy in front of the apps (since Oct 19 those two domains are let in; `docs/operations.md`, "Who can open the apps"). Then ask for a code to test. Nobody, gala admins included, can edit the staff list or the gala from the apps' API directly: changes go through the staff app's server functions, which log them (decided Oct 15).
   **Sign-in by email domain** (decided Oct 21): anyone whose email is at a domain in `staff_join_domains` joins the staff list on their first sign-in, with that domain's role, until its date (`staff_me()`; the join is in the activity log). It needs sign-ups on and the hook above. After the date their row stops working at once (`current_staff()`) and the hook makes no new logins for the domain. A named row (the three steps above) is never affected, so an admin at one of these domains gets their own row with `gala_admin`. Since Oct 21 both projects list @aafe.org and @pursuit.org, as relationship managers, until midnight New York time at the end of Nov 21, 2026. From the project's folder, `npx supabase db query --linked "<sql>"` with:
   - set or change it: `insert into staff_join_domains (domain, role, until) values ('aafe.org', 'relationship_manager', '2026-11-22 00:00 America/New_York'), ('pursuit.org', 'relationship_manager', '2026-11-22 00:00 America/New_York') on conflict (domain) do update set role = excluded.role, until = excluded.until;` (a later date lets people who joined back in, with the role they last had);
   - see who joined: `select name, email, role, access_until from staff_users where access_until is not null;`
   - end it now: `update staff_join_domains set until = now(); update staff_users set access_until = now() where access_until is not null;`
   **Sign-in on gala night** (security review, Gate 2). Authentication → SMTP Settings: turn on custom SMTP. Supabase's built-in sender sends only a few emails an hour, and only to the project team's own addresses, so staff and volunteers couldn't get their codes. For AAFE's project, use Resend with AAFE's verified domain, the same sender as `EMAIL_FROM` below. Resend without a verified domain (`onboarding@resend.dev`) delivers only to the Resend account's owner, so it can't send codes to staff. That is why stable sends its codes through a team Gmail account with an app password (host `smtp.gmail.com`) instead. Authentication → Rate Limits: emails sent per hour at least the number of people who might sign in within one hour (30 or more). Sign In / Providers → Email: the code expires after 3600 seconds (an hour) or less. Sign the iPads in before doors open: the check-in app stays signed in until someone taps Sign out.
3. **Edge functions.** In the folder linked to the project (step 1; check with `cat supabase/.temp/project-ref`):
   ```bash
   npx supabase secrets set \
     GIVELIVELY_ORG_ID=... GIVELIVELY_API_KEY=... \
     RESEND_API_KEY=... EMAIL_FROM="AAFE Gala <gala@your-verified-domain>" \
     GUEST_PORTAL_URL=https://<portal address>/ LINK_TOKEN_SECRET="$(openssl rand -hex 32)"
   npx supabase functions deploy givelively-sync
   npx supabase functions deploy send-emails
   npx supabase functions deploy salesforce-push
   ```
   Deploy each function by name: a bare `functions deploy` would also deploy the demo stand-ins (`givelively-mock`, `salesforce-mock`), which a real project must not have. `CRON_SECRET` is set by step 4. `send-emails` sends nothing until all four of `RESEND_API_KEY`, `EMAIL_FROM`, `GUEST_PORTAL_URL` and `LINK_TOKEN_SECRET` (32+ characters) are set. Salesforce's two settings are under "Demo with a stand-in Salesforce", "For real AAFE use".
4. **Schedules.** `node scripts/setup-cron.mjs <PROJECT-REF>`. It stops unless this folder is linked to that project, makes a new random `CRON_SECRET` and saves it in the function secrets, runs `database/cron.sql` with the project address and that secret filled in (nobody sees the secret), and lists the five jobs. Safe to run again; each run replaces the secret.
5. **Check.** `select jobname, schedule, active from cron.job;` lists the five schedules. `select * from givelively_sync_state;` shows the last poll. `select * from email_log where status = 'queued' and approved_at is null;` shows drafts waiting for staff approval. To run a scheduled function right away, in the SQL editor: `select call_edge_function('send-emails');` (or `'givelively-sync'`); it answers a request id, and `select status_code, content from net._http_response order by id desc limit 1;` shows the reply a moment later.

**Every email needs staff approval** (team hard rule 4). Give Lively purchases, pledges and recorded payments create a *draft* guest-list email, and staff approve it (`staff_approve_email`) or discard it (`staff_cancel_email`). A staff member sending their own email ("send new link", QR invite) counts as the approver, and both are logged. Sponsor links expire at the end of the order's guest-list deadline day (New York time).

The approval screen calls `staff_email_queue()`: every unsent email, drafts first, each with its state (`draft`, `approved` and waiting for the sender, or `failed` after 5 attempts with the error), the sponsor and package, unnamed seats and deadline, and for a payment confirmation the payment it confirms.

- **Payment confirmation** (`payment_receipt`): `staff_record_payment` drafts one for every check, ACH or wire payment staff record. It states the amount, date and balance, and says it is not a tax receipt (Give Lively sends its own receipts for online purchases).
- **Guest-list reminder** (`guest_list_reminder`): `staff_queue_guest_list_reminders(p_min_days default 7)` drafts one for each sponsor of the current gala who still has unnamed seats, already got a link, and whose deadline hasn't passed. It skips sponsors with a link or reminder still waiting, or one sent in the last `p_min_days` days. A reminder carries a fresh private link, so the newest email always has the one that works. If every seat gets named before it goes out, the sender refuses it and it shows as failed for staff to discard.

Until `RESEND_API_KEY`, `EMAIL_FROM`, `GUEST_PORTAL_URL` and `LINK_TOKEN_SECRET` are all set, approved emails wait in the queue and nothing is sent. A guest-list link or reminder for an order whose deadline has passed can't be approved (it would arrive expired): extend that order's deadline first (`staff_set_order_deadline`), and the sender refuses one whose deadline passed after approval. Once Resend accepts an email, saving that is retried and never counts as a failed send, so a database hiccup can't send a second email whose new link replaces the first. If the save still fails, the next run resends the identical request: each attempt's link is derived from `LINK_TOKEN_SECRET`, the email's id and its attempt (`_shared/linkToken.ts`), and each attempt's request is saved just before it goes out (`email_send_snapshots`, `email_save_snapshot()`, `_shared/emailSnapshot.ts`) with its link, QR code and QR image replaced by placeholders, so a retry resends it unchanged even if the gala or the order changed in between. Resend recognizes the same Idempotency-Key and body and returns the first send without sending again, and the save then makes the link the sponsor already has work. The saved request holds the recipient's address, so it's kept in its own table that only the email worker reads (no staff role and no public key can), and it's deleted as soon as the attempt is over: the email is sent, cancelled or sent back to draft, the attempt fails (the next attempt is built fresh, with a new link), or its address changes or is deleted after the gala (`email_log_drop_snapshot`). Changing `LINK_TOKEN_SECRET` or `EMAIL_FROM` while an email waits on a retry makes that retry a different request: Resend refuses it, the attempt fails, and the next attempt sends a new email whose link works. Each `send-emails` run claims its batch first (`email_claim()`), so the every-minute schedule and a manual "send now" never send the same email twice or replace a link a sponsor already received. A claim older than 10 minutes, from a run that stopped mid-send, is released for the next run. Until the Give Lively secrets are set, the poller returns `not_configured`.

## Stable: the project, apps and settings

Release candidates are tagged on `main` (`v1.0.0-rc.1` on Oct 23 and `v1.0.0-rc.2` on Oct 26, each with a GitHub pre-release and its notes); `v1.0.0` follows Gate 5 and AAFE's sign-off.

| | Stable |
| --- | --- |
| Git branch | `main` (then `release/v1` from v1.0.0) |
| Supabase project | `aafe-gala-guest-list` (`abmlzjwnwpkypubpzcsn`) |
| Apps | `aafe-gala-staff`, `aafe-gala-checkin`, `aafe-gala-portal` `.pages.dev` |
| Upload with | `--branch main` |
| Staff list | The team, AAFE's reviewers, Pursuit's advisors; and anyone at @aafe.org or @pursuit.org as a relationship manager until Nov 21 (Oct 21) |
| App emails (Resend, Oct 18) | Sender "AAFE Gala Demo", all redirected to the Resend account's owner ("Test emails on your laptop", below) |
| Sign-in codes | Team Gmail account (custom SMTP); sign-ups on with the `hook_staff_signup` hook (Oct 21) |
| Schedules | All five (`setup-cron.mjs`, Oct 18 and 19) |

- **Check the linked project first.** The Supabase CLI remembers its linked project per folder (`supabase/.temp/`). Before every `db:backend`, `db:load`, `functions deploy` or `setup-cron.mjs`, `cat supabase/.temp/project-ref` must name stable's project.
- **The app `.env.local` files** (gitignored) point at that same project; an app built in the folder talks to it.
- **`prototype/.env.admin.local`** (gitignored) holds the Cloudflare settings for `scripts/cloudflare-access.mjs`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_DOMAINS` and `CLOUDFLARE_ACCESS_EMAILS` (`docs/operations.md`, "Who can open the apps"). Keep Supabase keys out of it (`docs/keys-and-secrets.md`).
- **Another project** (AAFE's own, or a new test copy): the steps in Setup above, in its own working folder linked to it, with its own function secrets, never copies of stable's.

### Upload the apps (Cloudflare Pages)

Each app is a Cloudflare Pages project: `aafe-gala-staff` (`staff-app/`), `aafe-gala-portal` (`guest-portal/`), `aafe-gala-checkin` (`checkin-app/`). Uploads are made from a laptop; nothing builds on Cloudflare.

1. **Once per laptop:** `npx wrangler@4 login` (opens the browser). Once per Cloudflare account: `npx wrangler@4 pages project create aafe-gala-staff --production-branch main`, and the same for the other two.
2. **Check the checkout, then build.** Stable: the stable folder detached at the commit being released (`git switch --detach origin/main`, or the release tag), and `git log -1 --oneline` names it, and `cat supabase/.temp/project-ref` names stable's project. Then `npm run build` (all three apps; `npm run build -w staff-app` for one). Check each built app points at that project: `Select-String -Path staff-app/dist/index.html, guest-portal/dist/index.html, checkin-app/dist/index.html -Pattern <project ref> -List` (PowerShell), or `grep -l <project ref> staff-app/dist/index.html guest-portal/dist/index.html checkin-app/dist/index.html` (Git Bash, Mac or Linux), lists every file you'll upload. A missing `.env.local` silently builds the offline demo instead.
3. **Upload** each app:
   ```bash
   npx wrangler@4 pages deploy staff-app/dist --project-name aafe-gala-staff --branch main --commit-dirty=true
   npx wrangler@4 pages deploy guest-portal/dist --project-name aafe-gala-portal --branch main --commit-dirty=true
   npx wrangler@4 pages deploy checkin-app/dist --project-name aafe-gala-checkin --branch main --commit-dirty=true
   ```
   `--commit-dirty=true` only stops wrangler warning that the checkout has uncommitted changes.
4. **Check:** `npx wrangler@4 pages deployment list --project-name aafe-gala-staff` shows the newest upload, its branch and its commit: the commit you built. "Uploaded 0 files" means Cloudflare already had that exact build, so nothing new went up. Then open the app and sign in once.

**Order:** a database change goes first (`npm run db:backend`), then any changed server function (`npx supabase functions deploy <name> --project-ref <ref>`), then the uploads, so a new app never calls a function the database or the server doesn't have yet. `setup-cron.mjs` only when `database/cron.sql` changed. After `v1.0.0`, stable builds from `release/v1` and still uploads with `--branch main` (another branch name would make a preview, not the live app).

## Demo with a fake Give Lively (all synthetic)

AAFE's real Give Lively account isn't used. `givelively-mock` is a pretend Give Lively account that answers exactly like the real Zapier JSON endpoint, so the real sync code runs unchanged.

**Extra setup (after step 3 above):**
1. SQL editor: run `database/demo_givelively.sql`. It loads 4 fake purchases:
   - Lotus Community Bank, Gold table, 10 seats
   - Harborview Health Partners, Silver, 8 seats, paid by bank ACH
   - Sofia Reyes, 2 Community Tickets, donor covered the fee
   - a Year-End Appeal donation, which the sync must ignore
2. Deploy and point the sync at the fake account:
   ```bash
   npx supabase functions deploy givelively-mock
   npx supabase secrets set GIVELIVELY_BASE_URL=https://<PROJECT-REF>.supabase.co/functions/v1/givelively-mock \
     GIVELIVELY_ORG_ID=demo-aafe GIVELIVELY_API_KEY=<any made-up string> \
     EMAIL_REDIRECT_TO=<your own email> EMAIL_FROM="AAFE Gala Demo <onboarding@resend.dev>"
   ```
   With a free Resend account and no verified domain, `onboarding@resend.dev` can send only to your own Resend login email, so use that for `EMAIL_REDIRECT_TO`. Every email (sent to fake `@example.org` addresses) is redirected there, with the original recipient in the subject.
3. Guest Portal: copy `guest-portal/.env.example` to `guest-portal/.env.local`, fill in the project URL and anon key, then `npm run dev:guest`. Set `GUEST_PORTAL_URL` to wherever the portal runs (e.g. `http://localhost:5173/`).

**Run the demo** in the SQL editor (the cron secret is never shown, so these go through `call_edge_function()` from `cron.sql`, which reads it from the Vault):
```sql
-- (optional) a sponsor buys a table "live"
select demo_givelively_purchase('Golden Gate Tea (synthetic)', 'Wei', 'Zhang', 'wei@goldengate.example.org',
  'Gold — Documentary Screening Sponsor', 25000);
select call_edge_function('givelively-sync');   -- import now (otherwise within 15 min)
```
Then, in the staff app, a gala admin approves the new guest-list email under Integrations & email (or on the sponsor's page in Sponsors & orders). The schedule sends it within a minute (or `select call_edge_function('send-emails');`). Open the email in your inbox and click **Add or update guest names**. The Guest Portal shows the sponsor, the package, the paid amount and the empty seats, all of which came from the fake Give Lively purchase.

The flow is tested in `npm run test:backend` (fake feed → mapping → import → Guest Portal view).

**For real AAFE use:** don't run `demo_givelively.sql` or deploy `givelively-mock`. Remove `GIVELIVELY_BASE_URL` and `EMAIL_REDIRECT_TO`.

## Test emails on your laptop (your own Resend key)

Stable sends through Aisling's Resend account, and with no verified domain Resend delivers only to its account owner, so those emails all go to her. To see the emails yourself, run `send-emails` on your laptop with your own free Resend account and key. Stable isn't touched. Needs Docker (for the local Supabase).

1. **Your key, once.** Sign up at resend.com, then:
   ```bash
   npx resend-cli@2.26.0 login
   npm run email:local -- <the email you signed up to Resend with>
   ```
   It makes a sending-only key on your account, writes it with the other settings to `supabase/functions/.env` (git ignores it; the key is never shown), and sends you a test email. Every email the app sends is redirected to you, with the real recipient in the subject. `--replace` swaps in a new key and deletes the old one.
2. **A local Supabase with the small demo set.**
   ```bash
   npx supabase start
   npm run db:local
   ```
   `db:local` loads `schema.sql`, `seed.sql` and `backend.sql` through `psql` inside the local database's container (`supabase db query --local` runs only one statement at a time). To start over: `npx supabase db reset`, then `npm run db:local` again.
3. **Run the sender** (reads `supabase/functions/.env`), and leave it running:
   ```bash
   npx supabase functions serve send-emails
   ```
4. **Approve a draft and send it.** In a second terminal, approve the guest-list reminder to Jordan Lee (the staff app's Approve button does the same), then call the sender with the `CRON_SECRET` from your `supabase/functions/.env` (in PowerShell, write `curl.exe`):
   ```bash
   npx supabase db query --local "update email_log set approved_by = 'Local test', approved_at = now() where id = 'em-022'"
   curl -X POST http://127.0.0.1:54321/functions/v1/send-emails -H "x-cron-secret: <CRON_SECRET>"
   ```
   It answers `{"sent":1,…}` and the reminder arrives. Its link points at the portal on `http://localhost:5173/`; to open it, run the portal (`npm run dev:guest`) with `guest-portal/.env.local` pointing at your local Supabase (`npx supabase status` shows the address and anon key).
5. **Done:** `npx supabase stop`. Delete your key at resend.com/api-keys when you no longer need it.

## Demo with a stand-in Salesforce (all synthetic)

Give Lively's own Salesforce connector already sends its online purchases to AAFE's Salesforce (NPSP today; Idlewild is moving it to its Nonprofit Accelerator, so the fields below are mapped to it first: `docs/salesforce-setup.md`): the buyer as a Contact (matched by email), an Opportunity, and the event's Campaign (named after the Give Lively page) with the buyer as a member. It never sends guests or Accounts ([its documented sync logic](https://www.givelively.org/resources/see-our-salesforce-integration-logic-and-fields)). `salesforce-push` sends what Give Lively doesn't know, for the current gala (`salesforce_outbox()` in `backend.sql`, mapped by `_shared/salesforce.ts`):

| Here | Salesforce |
| --- | --- |
| The gala | Campaign: Give Lively's own when there is one with the gala's Give Lively page name, else ours |
| A sponsor with a check, ACH, wire or staff-entered order | Account |
| That order (not Give Lively's, not a comp) | Opportunity, in the gala's Campaign; paid is Closed Won, cancelled Closed Lost, the rest Pledged |
| A check, direct ACH or wire payment staff recorded | `npe01__OppPayment__c` |
| Every named guest, comps and Give Lively buyers' guests included | Contact (name and email), and a Campaign Member: Registered, Attended or No Show |

**Nothing twice next to Give Lively's records (Gate 1, box 5).**
- **Contacts by email, the way Give Lively matches them.** Before making any Contact, the push looks up the guests' emails in Email and NPSP's Personal, Work and Alternate Email.
  - A guest Salesforce knows is linked to that Contact, never overwritten. When several match, Give Lively's own tie-break picks: most gifts, then a mailing address, then the latest updated.
  - Only guests Salesforce doesn't know become Contacts, one per email (two guests sharing an inbox are one Contact).
  - If the lookup fails, no Contact is made that run.
- **One membership per Contact.** A guest already in the Campaign (Give Lively adds its buyers) keeps that membership; only its status changes.
- **Comps are guests only.** No Account and no Opportunity: a comp is no gift, and its guests are Contacts and Campaign members like everyone's.
- **When it can't tell, it makes nothing.** If two Campaigns carry the gala page's name, the sync says to put the gala's id in `AAFE_Gala_Id__c` on the right one; a Campaign with that id always wins.

No phones, dietary or accessibility details are sent. Our own records are upserted on our ids in a custom external-ID field, `AAFE_Gala_Id__c`, so a second sync updates them instead of adding duplicates, and a record whose parent is missing fails on its own while the rest go through. Each record's outcome is kept in `salesforce_sync`, the Account and Opportunity ids on the sponsor and order (the CSV export reads them), and one change-log line per run. A gala admin runs it from the staff app (Integrations, **Sync now**). Tested in `npm run test:backend` (`scripts/test-salesforce.mts`).

In the demo it goes to `salesforce-mock`, a stand-in org that answers the calls the push makes (the SOQL lookups it sends, read by `salesforce-mock/soql.ts`, and sObject Collections upsert, create and update) and keeps the records in `demo_salesforce_records`. Like Salesforce, it refuses a second membership of one Contact and a change to a member's Campaign or Contact. It never talks to a real org (requirements: Salesforce push, simulated). The test seeds it with what Give Lively's connector would have made. When `SALESFORCE_BASE_URL` is this project's own `salesforce-mock`, `salesforce-push` reaches the stand-in through its database functions directly (`salesforce-mock/standin.ts`), not over HTTP: Supabase lets one chain of function-to-function calls make only 30 requests a minute, and a full gala's lookups need more (on stable, Oct 18, the memberships were refused). Any other address, a real org included, is reached over HTTP.

1. In the SQL editor (after `backend.sql`), run `database/demo_salesforce.sql`.
2. Deploy and point the push at the stand-in:
   ```bash
   npx supabase functions deploy salesforce-mock
   npx supabase functions deploy salesforce-push
   npx supabase secrets set SALESFORCE_BASE_URL=https://<PROJECT-REF>.supabase.co/functions/v1/salesforce-mock \
     SALESFORCE_TOKEN=<any made-up string>
   ```
3. **Sync now** on Integrations & email, or `select call_edge_function('salesforce-push');` in the SQL editor. Then `select sobject, count(*) from demo_salesforce_records group by 1;` shows what "Salesforce" holds.

**Since the review of #190 (Oct 20):** a guest with no email is skipped, not made a Contact (by name alone it could only be a duplicate); staff see how many in the Sync message. A sponsor whose name is already on one Account in AAFE's org is linked to it, never overwritten; two or more with that name and nothing is made until staff put our id in the right one. Two settings, for AAFE and Idlewild Partners to decide: `SALESFORCE_SEND_PAYMENTS=false` (then NPSP's own payment, one per Opportunity for its full amount, is the only record; by default the tool sends each real payment and marks its Opportunities `npe01__Do_Not_Automatically_Create_Payment__c`, so NPSP makes none, since Oct 24) and `SALESFORCE_SEND_GUESTS=attended` or `none` (default: every named guest, as before). Setup for AAFE's partner: [`docs/salesforce-setup.md`](../../docs/salesforce-setup.md).

**For real AAFE use:** don't run `demo_salesforce.sql` or deploy `salesforce-mock`. Sign in with a connected app: `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET` (client credentials flow) get a fresh token each run, since an access token expires; `SALESFORCE_TOKEN` is only for the stand-in. AAFE's org needs:
- the `AAFE_Gala_Id__c` field (Text, External ID, Unique) on Campaign, Account, Opportunity, `npe01__OppPayment__c` and Contact;
- nothing for the member statuses: since Oct 24 the sync adds Registered, Attended and No Show to the gala's Campaign itself, before its first member (the run-as user needs to create Campaign Member Statuses);
- an External Client App (new connected apps are restricted since Spring '26) with the client credentials flow and a run-as user, for the client id and secret.

Then `SALESFORCE_BASE_URL` is the org's instance URL. Run the first sync after Give Lively's first sale, so its Campaign already exists. A sponsor organization AAFE already has as an Account is matched by exact name (#213; two matches and nothing is made). Gaps found on Oct 24 against NPSP and Idlewild's setup (payments counted twice, Give Lively's Campaign renamed, member statuses, refusal reasons, record types): `docs/salesforce-setup.md`, "Checked against Idlewild and NPSP".

## Give Lively

- **Credentials.** An AAFE admin creates the Zapier API key in the Give Lively Nonprofit Admin Portal. The org ID and key go into the URL `secure.givelively.org/nonprofits/<ORG_ID>/json_dataclips/<API_KEY>.json`, so treat that URL as a password. The function never logs it.
- **Only gala sales.** The endpoint returns *all* of AAFE's donations. Only donations from this gala's Give Lively pages are imported: `gala_events.givelively_page_name` (e.g. "AAFE's 52nd Annual Gala"), set once a year by a gala admin (`staff_set_gala_page`), plus any more pages the gala sells on (a sponsorship page, a ticket page) in `givelively_other_pages` (`staff_add_gala_page`, `staff_remove_gala_page`). Names match ignoring case and extra spaces (`name_key()`). Adding a page makes the next poll look back over all purchases once. No page set: the sync does nothing and says so. `demo_givelively.sql` sets it to "AAFE Gala 2027" for the fake account.
- **Field names are not documented by Give Lively.** The mapping in `_shared/givelively.ts` follows the "Line Items (All)" report names and tolerates snake_case, nesting and amounts in cents. **Before launch, run one poll against AAFE's account and check `select * from givelively_raw where import_status = 'unmapped';`.** Any row there means a field name needs adding to `FIELDS`.
- **Rules.**
  - No duplicates: a purchase is matched on its purchase key (buyer email + UTC purchase time), or its Give Lively transaction ID when the sync has one.
  - Refunds update the existing payment and flag it for review.
  - Only a full refund cancels an order: by amount, or a status that says "Refunded" and nothing more. "Partially Refunded" keeps the order and its seats, as partly paid (import spec case 19).
  - Pending bank payments are skipped until Give Lively reports them settled.
  - A purchase that fails after it was imported (a bounced ACH, a cancelled or declined donation) is cancelled, as the CSV import does: the order, its seats and any unsent guest-list link, with a staff review item. A failed donation that was never imported creates nothing.
  - The sync and the CSV upload use the same failure words (failed, declined, cancelled, voided, reversed, returned), so one donation can't be live in one and cancelled in the other.
  - Give Lively's own fee is stored as reported and never recomputed. AAFE's ticket export has no fee column, so an uploaded purchase's fee is unknown (`null`), not $0, and so is its net; the sync fills both in when it sees the same purchase, logged as `payment.fee_known` (Gate 1).
  - A wallet (Apple Pay, Google Pay, PayPal, Venmo, a donor-advised fund) is recorded as `card`, with the wallet in `payments.method_detail` (`payment_method_of()`, `payment_method_detail()`; decided Oct 17).
  - A dispute (chargeback), from the sync or from a report that has a dispute column, flags the payment and raises a `disputed` staff review; nothing is cancelled, since the dispute may still go AAFE's way. Blank, "none" or "false" is no dispute (Gate 1).
  - The sync reads Give Lively's older field names (`page_name`, `donation_amount`) and the event export's column names too, so a feed in any of those shapes isn't stored as unmapped (`_shared/givelively.ts`, Gate 1).
  - Linking a tier the sync held (`staff_set_tier_mapping`) makes the next poll look back over all purchases once, as adding a page does, so the held purchase comes in; re-reading imports nothing twice. A purchase held from an upload comes back with the next upload (Gate 1).
- **Flagged for review** (`payments.reconciliation_status = 'needs_review'`, reason in `orders.internal_notes`):
  - (an unknown package no longer defaults to Community Ticket: nothing is created, and it goes to `import_review` as `unknown_tier`)
  - the payment method wasn't recognized (a wallet is recognized: see above)
  - the fee was missing (sync only; AAFE's ticket export has no fee column)
- **Ticket quantity.** A ticket purchase gets one seat per ticket. The count comes from Give Lively's quantity field if present, otherwise from amount ÷ ticket price.
- **CSV upload (the main path for AAFE's ticket export).** The staff app parses the file with `import-engine/` (`prepareUpload`, then `toGlImport`) and calls `staff_import_givelively(rows, run)`, admin only, one transaction. Purchases are matched on `payments.purchase_key` (email + UTC purchase time; `purchase_key()` computes the same key for sync rows). Unknown tiers go to `import_review` until an admin maps them (`staff_set_tier_mapping`); clear guest names are pre-filled as `submitted` only on orders nobody has named; a changed guest list later raises `guest_text_changed` instead of overwriting. Each upload is an `import_runs` row; staff close review items with `staff_resolve_import_review`. Spec: `docs/import-matching-spec.md`.

## Guest Portal API (anon key)

Each call takes the private link token. The token is stored only as a SHA-256 hash. An invalid, expired or cancelled link raises `invalid_link`.

| Prototype function (`guest-portal/src/portalApi.ts`) | Backend call | Returns |
|---|---|---|
| `getPortalView(db, token)` | `rpc('portal_get_view', { p_token })` | Same `PortalView` shape |
| `saveAttendee(db, token, slot, input)` | `rpc('portal_save_guest', { p_token, p_slot, p_guest: input })` | Updated `PortalView` |
| `removeAttendee(db, token, slot)` | `rpc('portal_release_seat', { p_token, p_slot })` | Updated `PortalView` |

Never returned: payment method, fees, check numbers, internal notes, relationship owner or notes, and other orders. A seat whose guest is checked in can't be edited (`seat_locked`). AAFE's review of each seat is still returned, but the portal doesn't show it, and review events are left out of the sponsor's activity (#240).

## Staff App API (logged-in users)

Reads (RLS, `backend.sql` section 3): `gala_admin` and `relationship_manager` can `select` the gala's tables directly, with three limits (decided Oct 15). Guests, `email_log` and `import_review`: gala admins read every year, relationship managers only the current gala's. `givelively_raw`: gala admins only. `audit_log` (decided Oct 22): gala admins read all of it; relationship managers only the sponsor portal's entries and Give Lively's (`actor_type = 'guest_portal'`, or a `system` actor starting "Give Lively"), the dashboard's feed, and `staff_sync` sends each no more. `audit_log.changes` (old and new values): no app reads it. `check_in_volunteer` can't read tables: volunteers get the door list from `door_sync()`.
Writes: only through these functions, and each one writes `audit_log`. `audit_log` can't be updated or deleted.
**Guest names (Oct 10).** `guests.display_name` is the guest's name as written: badges, the check-in list, the door list, exports and the portal print it. `first_name` and `last_name` are a best guess for sorting and search, from the name engine (`import-engine/src/names.ts`). `portal_save_guest`, `staff_update_guest` and `staff_add_comp_guest` take a `display_name`, first and last, or both; `name_parts()` fills in whatever is missing (a full name alone falls back to last word = last name). A one-word name is allowed, with an empty last name. A display name that's just "First Last" follows a new first or last name; one staff corrected stays. Salesforce gets the last name, or the whole name when there is no last name.

Guest edits (`staff_update_guest`, and a sponsor editing a named guest through `portal_save_guest`) also record the old and new value of each changed field in `audit_log.changes`, e.g. `{"title": {"from": "Manager", "to": "Director"}}`. It stays in the database for the record (the SQL editor reads it); no app can read it, since it holds emails and food and access answers. The staff app's activity log and the portal's show the summary. Since Oct 22 (#234) the staff app's Activity log page is gala admins' only, and a sponsor's activity opens from the **Activity** button on Sponsors & orders; relationship managers see only what sponsors and Give Lively changed (`audit_log`'s `staff_read` policy). Status changes, seating, and payment amounts keep using `from_state` and `to_state`.

| Prototype (`staff-app/src/store.ts`) | Backend call | Roles |
|---|---|---|
| (login) | `rpc('staff_me')` → `{ id, name, email, role }` or null | all |
| `updateGuest` | `staff_update_guest(p_guest_id, p_patch)` | admin, RM |
| `setSeatStatus` | `staff_set_seat_status(p_guest_id, p_to)`, enforcing submitted→reviewed→badge_ready (needs table+seat) | admin, RM |
| `markPrinted` | `staff_mark_printed(p_guest_ids)` | admin, RM |
| `assignSeat` | `staff_assign_seat(p_guest_id, p_table_id, p_seat)`; null table = unseat; `seat_taken` if occupied | admin, RM |
| `seatOrderAtTable` | `staff_seat_order_at_table(p_order_id, p_table_id)` | admin, RM |
| `recordOfflinePayment` | `staff_record_payment(p_order_id, p_method, p_amount, p_received, p_check_number)`: the received date is required and can't be more than 3 days ahead (#231). The staff app's form also warns before the same check number twice or an amount over the balance (#232, in the app only) | admin, RM |
| `voidPayment` | `staff_void_payment(p_payment_id, p_reason)`: undoes a check, ACH or wire entered by mistake; the order's status follows what's left, an unsent receipt is cancelled, the log keeps the reason and the whole payment. Give Lively payments can't be voided (#223). One already sent to Salesforce stays there: the answer (`in_salesforce`) and the log say to remove it in Salesforce too, and its `salesforce_sync` row still reads synced until then. Added Oct 23 with no screen yet: until the Void button (#223), a gala admin runs it in the SQL editor signed in as themselves, the way "After the gala" below runs `staff_clear_needs`: `begin; select set_config('request.jwt.claims', '{"email": "<a gala admin's staff email>"}', true); select staff_void_payment('<payment id>', '<why>'); commit;` (`docs/operations.md`, "Gala night"). The call on its own answers `forbidden` there: the SQL editor's token has no staff email, so `current_staff()` finds nobody | admin |
| `addPledge` | `staff_add_pledge(p_org, p_contact, p_email, p_tier_id, p_source)` | admin, RM |
| `addCompGuest` | `staff_add_comp_guest(p_guest)` | admin, RM |
| `sendQrInvite` | `staff_send_qr_invite(p_guest_id)`; approved by the sender, and logged as `email.approved` in their name. The guest needs a seat and an email; the code is minted when it sends | admin, RM |
| `resendPortalLink` | `staff_resend_portal_link(p_order_id)`; approved by the sender, and logged as `email.approved` in their name; the old link stops working | admin, RM |
| `checkIn` | `staff_check_in(p_guest_id, 'search')` or `staff_check_in_qr(p_code)` | all |
| `checkInException` | `staff_check_in_exception(p_name, p_order_id, p_type, p_note)` | all |
| Check-in → the door list, kept for offline use | `door_sync(p_cursor, p_event)`: the first call (no cursor) brings every guest with table, seat, an accessibility flag (`has_access_needs`, never the details), arrival, and their QR code's hash; no email, phone, payment, dietary needs or notes. After that, only what changed since the cursor. The iPad and a volunteer in the staff app both use it. `staff_checkin_snapshot()` returns the whole list in one go (the tests compare the two); `checkin_list()` and `staff_export_checkin()` carry the same flag. A read, not logged | all |
| Check-in → sync offline check-ins | `staff_sync_check_ins(p_items)`: see "Offline check-in" below | all |
| (every page) keep the staff app's copy up to date | `staff_sync(p_cursor, p_event)`: the first call brings everything the role may read, then only what changed, with deleted rows as markers. A read, not logged | admin, RM |
| Check-in → undo (Oct 8) | `staff_undo_check_in(p_id)`: the check-in's id or the iPad's `client_id`. Only the staff member who made it (by account) or a gala admin; the guest goes back to expected and the seat to its status before check-in; logged as `checkin.undone` | all (own check-ins); admin (any) |
| Sponsors → pipeline board | `staff_pipeline()`: totals per stage against the goal, and every prospect with its ask, commitment, money received, balance, and the last two galas' giving; no emails or phones. A read, not logged | admin, RM |
| Sponsors → add or edit a prospect | `staff_save_prospect(p)`: `{ id? , sponsor_id? or organization + contact_name, sector, ask_amount, ask_tier_id, follow_up_owner_id, notes, order_id? }` | admin, RM |
| Sponsors → move a prospect | `staff_set_prospect_stage(p_id, p_stage)` | admin, RM |
| Sponsors → set the goal | `staff_set_sponsorship_goal(p_amount)` | admin |
| Gala info → save | `staff_update_gala_event(p_patch)`: name, date, doors and program times, venue, address, dress code and the two deadlines; nothing else. Logged with the old and new value of each field | admin |
| Sponsors → logo or program ad status | `staff_set_material_status(p_order_id, p_material, p_status)`: `logo` or `program_ad`; `not_required`, `pending`, `received` or `approved` | admin, RM |
| Gala info → sponsor arrivals on/off | `staff_set_sponsor_arrivals(p_on, p_note)`: off by default; switching on needs a note recording AAFE's privacy approval (who and when). See "Gala-night arrivals" below | admin |
| Give Lively import → upload (CSV) | `staff_import_givelively(p_rows, p_run)` | admin |
| Give Lively import → close a review item | `staff_resolve_import_review(p_id, p_resolution)` | admin, RM |
| Give Lively import → link an unknown level | `staff_set_tier_mapping(p_givelively_name, p_tier_id, p_page)` | admin |
| Give Lively import → the gala's Give Lively pages | `staff_set_gala_page(p_page_name)`, `staff_add_gala_page(p_page_name)`, `staff_remove_gala_page(p_page_name)` | admin |
| Sponsorship levels → add or edit, retire, copy last year's | `staff_save_level(p)`, `staff_retire_level(p_id, p_retired)`, `staff_copy_levels(p_from_event, p_to_event)` | admin |
| Sponsorship levels → start next year's gala | `staff_start_gala(p)` | admin |
| Reports | `staff_report_sponsors()`, `staff_report_payments()`, `staff_report_needs()` | admin, RM |
| Reports | `staff_report_attendance()`, `staff_report_guests()` | admin |
| After the gala → delete guests' contact details | `staff_delete_guest_contacts(p_event_id)`: see "After the gala: guests' contact details" | admin |
| Sponsors → an order's guest-list deadline (Oct 12; screen to come) | `staff_set_order_deadline(p_order_id, p_deadline)`: for a sponsor who bought after the gala's deadline or needs more time; a link already sent moves with it; not after the gala; logged | admin |
| After the gala → keep the food and access totals, delete the answers (Oct 18; screen to come) | `staff_clear_needs(p_event_id)`: see "After the gala" below | admin |
| Integrations "Pull now" | `functions.invoke('givelively-sync')` | admin |
| Integrations "Sync now" (Salesforce) | `functions.invoke('salesforce-push')` | admin |
| Approve / discard a draft email | `staff_approve_email(p_email_id)` / `staff_cancel_email(p_email_id)` | admin, RM |
| List unsent emails for the approval screen | `staff_email_queue()` | admin, RM |
| Draft guest-list reminders | `staff_queue_guest_list_reminders(p_min_days)` | admin, RM |
| Badges → "CSV for printer" | `staff_export_badges(p_include_printed default false)`: ready and reprint badges, sorted by table and seat; the name as written (`display_name`) plus first and last; badge fields only (no email, dietary, payment, or notes) | admin, RM |
| Check-in → printed list | `staff_export_checkin()`: every guest by last name plus one row per unnamed sponsor seat, with table, seat, and arrived; no email or dietary needs | all |
| Integrations → Salesforce file | `staff_export_salesforce()`: one row per arrival (walk-ins included) with email, Salesforce Account and Opportunity ids, and arrival time | admin |

Each export writes `audit_log` (`export.badges`, `export.checkin`, `export.salesforce`) with the row count. They return rows; the staff app saves them with `downloadCsv` (`shared/src/ui.tsx`), which already blocks spreadsheet formulas and keeps Chinese and Korean names readable in Excel. The columns are a first proposal until AAFE sends its badge and check-in templates.

### Gala-night arrivals for sponsors

Decided Oct 6: sponsors see which of their own guests have arrived, once AAFE's privacy review approves it. Until then it is **off** (`gala_events.sponsor_arrivals_visible`), and the portal shows nothing about arrivals: a seat locked by check-in says only that it can no longer be changed online. (Since #240 the portal shows no review status either, so a checked-in seat looks like any other.)

When a gala admin switches it on (`staff_set_sponsor_arrivals(true, 'Approved by … on …')`), `portal_get_view` adds:
- `arrivals`: `{ arrived, expected, walkIns }` for this sponsor's seats only (`null` while off);
- `seats[].arrived`: `true` or `false` for each named seat; seat status `checked_in` is shown as is.

Never a time, a staff name, a door, or a walk-in's name. Check-ins never appear in the sponsor's activity list. Switching on or off is logged, with the approval note.

### After the gala: food and access totals

Decided Oct 18 (`docs/decisions.md`): each guest's food and access answers are deleted after the gala, and AAFE keeps only that gala's totals. `staff_clear_needs(p_event_id)` (gala admins, once per gala, only once its date has passed):
1. **Saves the totals** in `gala_need_totals`: per option of `shared/src/guestNeeds.ts`, plus Other, how many guests chose it, and how many had any need, answered none, or never answered. It counts the guests of orders that weren't cancelled, exactly as the staff app's Food and access report does (`need_status()` and `need_choices()` mirror `needStatus` and `parseNeeds`; `scripts/test-needs-totals.mts` holds the two to the same counts on every demo set). No name, guest or written "Other" detail is kept.
2. **Deletes every guest's answers** for that gala, cancelled orders' guests included.
3. **Removes the old values from the change log.** A guest edit records each field's old and new value; for these two fields they become "cleared after the gala", and the rest of the edit stays. It's the one change ever made to `audit_log` rows: keeping the answers there would undo the deletion.
4. Writes one change-log line, `gala.needs_cleared`, with how many guests it cleared.

Staff read the totals from `gala_need_totals` (gala admins and relationship managers). Until the staff app has a button, a gala admin runs it from the SQL editor, signed in as themselves for the change log:
```sql
begin;
select set_config('request.jwt.claims', '{"email": "<your staff email>"}', true);
select staff_clear_needs('<the gala id, e.g. ev-2027>');
commit;
```
Not covered: a need a buyer typed into Give Lively's own guest box stays in Give Lively. Our own backup copies keep what they held until they're deleted under the same rule (the free plan has no Supabase backups, `docs/operations.md`).

### After the gala: guests' contact details (Gate 2)

Guests' contact details are deleted `retention_days()` after their gala: 60, the proposed default in `docs/data-handling.md`, built on Oct 18 ahead of AAFE's answer (`docs/decisions.md`). If AAFE picks another window, it changes in that one function. `contacts_delete` deletes, for one gala:
- every guest's email, and its old and new values in the change log ("deleted after the gala");
- the address on every email sent to one of the gala's guests (a QR invitation still waiting was already cancelled by `guests_void_qr`, as on any email change);
- email addresses inside the gala's import review items and in Give Lively's free-text guest lists (`orders.imported_guest_text`); the names stay;
- Give Lively's raw records of the gala's purchases (`givelively_raw`); the orders and payments keep what the app needs;
- food and access answers too, if staff haven't cleared them, their totals saved first (`needs_clear`, the step `staff_clear_needs` runs).

Guests' names, check-ins and **sponsors' own contact details** stay: those are AAFE's relationship records. The gala records when it was done (`gala_events.contacts_deleted_at`), and one change-log line, `gala.contacts_deleted`, says what went.

Two ways it runs:
- **A gala admin, any time after the gala**, e.g. right after downloading the Salesforce attendee file: `staff_delete_guest_contacts(p_event_id)`. Once per gala. Until the staff app has a button, run it from the SQL editor as for `staff_clear_needs` above.
- **Every day at 09:15 UTC** (`retention_sweep()`, in `database/cron.sql`): every gala `retention_days()` or more in the past with anything left to delete, including an email added after an earlier deletion. Run by the system, logged as "Retention, 60 days after the gala". The demo sets' past galas have no guests, so it changes nothing on stable.

`setup-cron.mjs` (Setup step 4) schedules it with the others; stable runs it since Oct 19. Tested in `scripts/test-guest-contacts.mts`.

### Sponsor pipeline

Decided Oct 6, from AAFE's prospect tracker. One row per sponsor prospect per gala (`sponsor_prospects`), at one of AAFE's stages: not started (0%), reached out (10%), in conversation (50%), closed won (90%), payment received (100%), lost (0%). Each has a sector, the ask (amount and tier), an AAFE follow-up contact besides the relationship manager, staff notes, and, once there is one, its order.

- **Staff move the early stages** with `staff_set_prospect_stage`. Every move is logged with the old and new stage.
- **Orders move it on by themselves:** a pledge or purchase links to the prospect (same sponsor, or the same organization name, since `staff_add_pledge` and the Give Lively import create a new sponsor record) and moves it to closed won; the first payment moves it to payment received. These moves are logged as the system. A sponsor who has paid can't be moved by hand.
- **Give Lively sponsorships with no prospect** join the board on their own. Tickets count only when the buyer is already a prospect (an individual, say); ads and comps never.
- **The board** (`staff_pipeline`) totals each stage's ask, commitment and money received, plus committed (closed won and paid), received, the open ask, and a weighted forecast (each commitment, or ask, times its stage's likelihood), against the goal a gala admin sets.
- **If an order is refunded and cancelled**, the prospect stays where it was; staff move it by hand (allowed once nothing is left paid).
- On first load, this gala's sponsorship orders join the pipeline at closed won or payment received.

### Offline check-in

Decided Oct 6: if the venue's internet drops, the iPad keeps checking guests in and syncs later. `shared/src/offlineCheckin.ts` (`CheckInDesk`) does the iPad side with no React or Supabase, so the check-in screen only wires it up:

1. While online, keep the list: `desk.saveSnapshot(await syncDoorList(call, desk.snapshot))`, where `call` is `door_sync(p_cursor, p_event)` (`shared/src/doorSync.ts`). The first call brings the whole list; after that only what changed since the saved cursor, merged in. The check-in app asks every 15 seconds.
2. At the door, online or not: `desk.scan(code)`, `desk.checkIn(guestId)`, `desk.checkInException({ name, order_id, type, note })`. Every check-in is saved on the iPad first. A QR code is checked against the saved hashes, so scanning works offline.
3. When online: `desk.sync((items) => rpc('staff_sync_check_ins', { p_items: items }))`.
4. Banner: `desk.banner(navigator.onLine)` gives "Offline · 3 check-ins waiting". Conflicts and refused items are in `desk.notices()`.
5. After gala night: `desk.clear()`.

**First arrival wins.** One check-in per guest (enforced by a unique index). If two doors check in the same guest, the earliest check-in stands, even if it syncs later. The other is written to the change log as `checkin.conflict` ("already checked in at 7:04 PM by Kenji Abe (Door 2); a second check-in at 7:06 PM … was not counted"), and the iPad shows it as a notice. Each check-in carries the iPad's id for it (`client_id`), so sending the same batch twice records nothing twice. The iPad's time is kept (never later than the server's clock).

Errors come back as the Postgres message: `forbidden`, `not_found`, `invalid_link`, `invalid_input: …`, `invalid_transition: …`, `seat_taken`, `seat_locked: …`.

**Input checks on the server (#231, Oct 23).** A new or changed email must look like one (`valid_email()`), from the portal (`portal_save_guest`) and from staff (`staff_update_guest`, `staff_add_comp_guest`, `staff_add_pledge`); an email already stored isn't checked again. A guest's fields are cut to the same lengths in the portal and in staff edits, after trimming: first and last name 100 characters; display name, title and organization 200; email 254; food and access answers 500. A longer value isn't refused, it's cut (`left(trim(…), n)`); whether the forms should warn first is a frontend question. Only a bad email is refused: it answers `invalid_input: …` with the reason, which the apps show as is.

## Changes to the schema (all in `backend.sql`)

`backend.sql` adds its tables and columns to `schema.sql`'s with statements that are safe to repeat. Every table and column, and why it exists: [`docs/data-model.md`](../../docs/data-model.md). The one-time data changes a project has had: `select * from schema_upgrades order by id;` (Setup step 1).

- **The current gala** (`current_event_id()`, Oct 12): the gala marked live; else the soonest one dated from 30 days ago on, so a gala stays current for a month after its date (results, the Salesforce export, late check-in fixes); else the newest not closed. Creating next year's gala in planning no longer takes check-in, imports and exports away from this year's before it's closed. Close a gala when its follow-up is done.

## Not done yet

- **Guest Portal is connected** when `guest-portal/.env.local` is set, and runs offline on the synthetic data when it isn't (the `OPEN-*.html` files). The landing page's demo cards come from the built-in data: connected, they are always the "Full gala, fixed" set's (`demoSet()` in `shared/src/data.ts`), so their links open only on a project loaded with `npm run db:load -- full-fixed`, as stable is.
- **Staff App is connected** when `staff-app/.env.local` is set (issues #8, #9). Every page action goes through `staff-app/src/api.ts`: one `staff_*` call from the table above, then a reload of what the role may read. Gala admins and relationship managers read the tables (RLS); a check-in volunteer loads only the door list, kept by changes with `door_sync()` as on the iPad, with no emails, phones, payments, notes or QR codes. Without the env file the same actions run on the demo data with the same role rules.
  - Live, Sponsors shows "Resend portal link" only (links are stored hashed, so there is nothing to copy), and relationship guests show their invitation status instead of a QR code.
  - Live, the Give Lively "Pull now" on Integrations (gala admins) runs `givelively-sync` right away, as the 15-minute schedule does, and shows its counts or its reason when it can't run (secrets or the gala's page name not set). It needs the function deployed (step 3).
  - Still simulated in both modes: the CSV import on Integrations (live CSV imports go through the Import page).
- **QR e-tickets (hard rule 6).** A code is minted only when an approved `qr_invitation` email sends; the database keeps its SHA-256 hash on the guest's seat (`seats.qr_token_hash`), valid until 6 a.m. New York time the morning after gala night. Resending replaces the code; a different guest on the seat, a name or email change, or a cancelled seat voids it. Staff can't display a code, only resend it. The seed's QR codes are moved onto seats as hashes when `backend.sql` runs. The seed's demo sponsor links are short (8 characters), fine for the demo but below rule 6's 128 bits; real links are minted at 128 bits by `send-emails`.
- **Email.** Templates (`_shared/emails.ts`) are in English: the guest-list link, guest-list reminders, payment confirmations, and QR invitations. The portal page is English only for v1 (decided Oct 24, #241): the Chinese, Korean and Spanish drafts stay in `guest-portal/src/i18n.ts`, hidden by `SHOW_LANGUAGES` in `guest-portal/src/App.tsx`, for AAFE to turn on once a native speaker on its staff has reviewed them (`prototype/docs/translations/guest-portal-review.html`). Reminders are drafted when staff ask (`staff_queue_guest_list_reminders`), not on a schedule.
- **Salesforce.** A stand-in only (the demo never talks to a real org): see "Demo with a stand-in Salesforce". `staff_export_salesforce()` gives a file shaped for a Contact and Campaign Member import, the real deliverable until AAFE connects its org.
- **Edge functions** are type-checked in CI (`deno check`) and their logic is tested in Node (email wording, the Give Lively sync's per-donation rules, the Salesforce mapping). They run on stable since Oct 18 (the schedules, approved emails through Resend, the stand-in Give Lively and Salesforce); none has yet talked to AAFE's real Give Lively account or a real Salesforce org.
