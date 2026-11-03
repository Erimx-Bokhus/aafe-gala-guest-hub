# Running the tool: free-plan limits, backups, gala night

The prototype runs on free plans: Supabase (one project, stable, in a free organization), Cloudflare
Pages and Access, a team Gmail account that sends the sign-in codes, and Resend, which sends the app's emails. This page lists what could stop it, how to
prevent each thing and how to recover, how to take and restore a backup, and a checklist for gala night. Gate 3 of
v1.0 (#149); limits read from the providers' pages on Oct 17, 2026 (sources at the end).

## Before going live: what still points at the team

- **Emails go to the team.** Since Oct 18 stable sends approved emails through Resend, from a team member's
  account with no verified domain, so every email is redirected to that team member's inbox. Sign-in codes are separate:
  Supabase sends them through the Gmail account.
- **The schedules run** (`prototype/database/cron.sql`, on both projects, set up with `prototype/scripts/setup-cron.mjs`):
  since Oct 18 the Give Lively poll every 15 minutes, the email sender every minute, and two daily cleanups (the
  schedules' run history, the staff app sync's deleted-row markers), and since Oct 19 the daily retention sweep. Nobody
  knows the cron secret: to run one now, `select call_edge_function('send-emails');` in the SQL editor.
- **Give Lively and Salesforce are stand-ins** (`givelively-mock`, `salesforce-mock`) with invented data.

To run for real: AAFE's Supabase and Cloudflare accounts (`decisions.md`, Oct 17); Resend with AAFE's own domain, for
the app's emails and, as custom SMTP, the sign-in codes; AAFE's own function secrets, without the demo settings
(`GIVELIVELY_BASE_URL`, `EMAIL_REDIRECT_TO`, the stand-ins' address in `SALESFORCE_BASE_URL`) and without deploying
the stand-ins (`BACKEND.md`, Setup steps 2 and 3); `start-levels-2026.sql` instead of the demo data; the sponsor portal
out from behind Access (the Access row below); and every key rotated (`keys-and-secrets.md`, "Before real data or
handoff"). Then shut the prototype's open doors:
- **End the email-domain sign-in** (Oct 21). **First, keep AAFE's own staff:** everyone who joined through @aafe.org
  has an end date, so the next line would lock them out on go-live day. Give each one who stays a row with no end
  date, and check their role: `update staff_users set access_until = null where email = '<their email>';` (or add
  them as in `BACKEND.md`, "Add a staff member"). Then: `update staff_join_domains set until = now(); update
  staff_users set access_until = now() where access_until is not null;` (`BACKEND.md`, "Sign-in by email domain").
- **Trim Cloudflare Access** to AAFE: take @pursuit.org and the team's personal addresses out of
  `prototype/.env.admin.local`, then `node prototype/scripts/cloudflare-access.mjs --apply`.
- **End the team's, advisors' and reviewers' staff rows:** `update staff_users set access_until = now() where id in
  (…);` keeps the change log's names, where deleting the rows wouldn't.
- **Salesforce:** AAFE's own client id and secret (`docs/salesforce-setup.md`, setup list).

## Risks

| Risk | Limit | What it means here | Prevent | Recover |
| --- | --- | --- | --- | --- |
| **The project pauses** | A free project with little database activity for 7 days is paused; the owner gets an email about a week before. A paused project can be restored for up to a year ([1], [2]) | Over a quiet stretch (Thanksgiving, after the Nov 10 handoff) everything stops: the apps, the poll, the emails. Before the 2027 gala it will have paused unless someone kept it awake | Someone reads the project owner's inbox. Use the apps weekly. Check the project is running a week before every review, Demo Day and the gala | Supabase dashboard → the project → **Resume project**; data and settings come back. How long it takes isn't published: resume early |
| **No backups** | The free plan has no daily backups and no point-in-time restore ([1], [3]) | A wrong SQL statement, a wrong `db:load` or a deleted project can't be undone. Gala-night check-ins live only in the database and on the iPads | Our own backup (below), weekly and before every event | Restore from that backup (below), or Pro ($25 a month) for 7 daily backups |
| **Two free projects** | Two active free projects across the organization's owners and admins; paused ones don't count ([4]) | Stable uses one slot, leaving one for a restore or a second project | Keep the owner and admin roles to who needs them | Pause or delete a project that isn't needed |
| **5 GB of data a month** | Shared by the whole organization. Over it: a notice, a grace period, then restrictions; after one grace period the next overage gets none ([1], [4], [5]) | Measured on the 553-guest gala: the **staff app** loads everything once, 1.1 MB (99 KB compressed), then every 10 s fetches only what changed since (`staff_sync`, Oct 17): about 0.6 KB when nothing did, about 1.4 KB per check-in, and everything again every 4 hours. One tab on gala night: **under 1 MB an hour** (it was 128 MB reloading everything every 30 s). The **iPad** and a check-in volunteer in the staff app keep the door list the same way since Oct 17 (`door_sync`): the whole list (281 KB, 27 KB compressed) at the start and every 4 hours, and in between only what changed, every 15 s on the iPad (about 0.4 KB when nothing did, so about 0.1 MB an hour plus the check-ins). Before, each iPad fetched the whole list once a minute, 16 MB an hour. In the gala-night load test, two door lists kept this way took 681 KB over 129 syncs, instead of 38,955 KB. Whether Supabase counts compressed bytes isn't published | Check the Usage page weekly and before events | Wait for the next billing month, or Pro (250 GB) |
| **500 MB database** | Read-only above it ([6]) | Small today. The schedules add about 1,540 rows a day to `cron.job_run_details`, which pg_cron never cleans on its own ([7]) | `cron.sql` now deletes run history older than a week | Delete old rows and vacuum; [6] explains how to leave read-only mode |
| **Sign-in codes through Gmail** | More than 500 emails a day blocks sending for up to a day ([8]); the app password stops working when the Google password changes ([9]) | Volume is fine. A password change silently stops every sign-in code | Don't change that Google password near an event; test a sign-in code the day before and the morning of | Make a new app password and put it in Supabase → Authentication → Emails → SMTP |
| **Resend's free plan** | 100 emails a day, 3,000 a month; `resend.dev` only sends to your own address ([10], [11]) | Today (stable) only the app's emails go through it, all to the account owner. On AAFE's project the sign-in codes would too, so codes, guest-list links, reminders and QR invitations share 100 a day: QR e-tickets for 550 guests take six days | Verify AAFE's domain; Resend Pro ($20 a month) for the gala months, or spread the sends over days | Wait for the next day (midnight UTC: 8 p.m. New York, 7 p.m. from Nov 1) or upgrade |
| **Cloudflare Access: 50 people** | A person takes a seat at their first sign-in and keeps it until removed; when 50 are taken, new people are refused. A code expires in 10 minutes ([12], [13], [14]) | The team, AAFE's reviewers, Pursuit's advisors and the volunteers share 50 seats. Since Oct 19 anyone at @aafe.org or @pursuit.org can sign in, and each one who does takes a seat. **The sponsor portal is behind Access too** (`prototype/scripts/cloudflare-access.mjs`), fine for the prototype, but for AAFE's real gala every sponsor would need a seat | Remove people who no longer need access. For the real gala, take the portal out from behind Access: its private link is the sponsor's credential | Zero Trust → Users → remove; the person asks for a new code |
| **Other Supabase quotas** | 500,000 Edge Function calls and 50,000 monthly sign-ins a month; logs kept one day ([1], [15]) | The email sender (every minute) and the Give Lively poll (every 15) use about 46,000 calls a month on stable; the daily jobs run in the database and call nothing | Look into a gala-night problem that same night: the logs are gone the next day. The change log (`audit_log`) keeps our own history; gala admins read it (Activity log) | — |

Cloudflare Pages is no risk: 500 builds a month, 20,000 files of up to 25 MB, unlimited requests ([16]); our builds
are 21 files, the largest 3.2 MB.

## Who can open the apps

Two locks, one after the other:

1. **Cloudflare Access**, in front of all three addresses: an email PIN, then the browser stays signed in for about a
   month (720 hours on the policy, 730 on each app). Since Oct 19 it lets in anyone with an **@aafe.org or @pursuit.org** address, plus Natalie's two
   personal addresses (`decisions.md`). Nobody else reaches the apps at all.
2. **The app's own sign-in**: a 6-digit code by email, for people on the staff list (`BACKEND.md`, "Add a staff
   member") and, since Oct 21, anyone at @aafe.org or @pursuit.org, who joins the list as a relationship manager on
   their first sign-in until Nov 21 (`BACKEND.md`, "Sign-in by email domain"). This is the lock that decides roles;
   it stays signed in until the person signs out, or until a joined person's date.

So a new person's first day takes two emails (Cloudflare's PIN, then the app's code); after that it is one PIN a month.

**Later options, not done (for the handoff or the real gala):**

| Option | What changes | Trade-off |
| --- | --- | --- |
| Take Access off the staff and iPad apps | One login: the app's own code. The portal stays behind Access | The two addresses are public; anyone can reach the sign-in page, and only invited staff get a code. Gala-night iPads lose the extra lock |
| Take Access off all three | One login for staff; sponsors open the portal straight from their private link, as they would for the real gala (the Access row above) | Anyone who finds the portal address sees its landing page, whose demo links open the invented sponsors' guest lists and let them be edited, so the demo links would need to come off first |

Either is one change in Zero Trust → Access → Applications, and can be undone the same way.

**Change who gets in** with `prototype/scripts/cloudflare-access.mjs`. It reads `CLOUDFLARE_ACCESS_DOMAINS` and
`CLOUDFLARE_ACCESS_EMAILS` (comma-separated) with the API token and account id from `prototype/.env.admin.local`
(gitignored). Run it without arguments first: it shows the live list and what would be added or removed, and changes
nothing. `--apply` then replaces the whole list with those two settings, so anyone added by hand in the dashboard and
missing from them loses access. After applying, it checks that all three addresses answer with Access's login.

## Backups

The CLI takes a backup through your Supabase login: **no database password is needed** (it makes a temporary login
role). It needs Docker running. In `prototype/` of the folder linked to stable (`BACKEND.md`, "Stable: the project, apps and
settings"), check the target with `cat supabase/.temp/project-ref`, then:

```bash
B="$HOME/aafe-backups/$(date +%F)-stable"; mkdir -p "$B"
npx supabase db dump --linked --role-only -f "$B/roles.sql"
npx supabase db dump --linked -f "$B/schema.sql"
npx supabase db dump --linked --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes -f "$B/data.sql"
grep -c '^COPY' "$B/data.sql"     # one per table with rows; check public.check_ins is there
```

- **What's in it:** our tables and functions (`schema.sql`); every row, including the sign-in accounts
  (`auth.users`) and any schedules (`data.sql`). Not included: Vault secrets, function secrets, Auth settings.
- **Where it goes:** outside the repo, in a private folder (the team's or AAFE's drive). It holds the sign-in emails
  of the team and reviewers. Delete old copies under the data-handling retention promise.
- **When:** weekly; before each AAFE review, Demo Day and the Nov 10 handoff; on gala day before doors open and after
  check-in closes; before any risky SQL.

**Restore** into an empty project (a new one, or a local `npx supabase start`). It needs `psql`, which comes with
PostgreSQL's command-line tools. The database URL comes from that project's Connect panel (or `npx supabase status`
locally):

```bash
psql --file roles.sql --dbname "$DB_URL"     # role settings; a local copy refuses its one realtime grant, which is harmless
psql --single-transaction --variable ON_ERROR_STOP=1 --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql --dbname "$DB_URL"
```

Then, for a hosted project: the function secrets and deploys and the Auth settings (`BACKEND.md`, Setup steps 2 and 3),
and **right after them** `node scripts/setup-cron.mjs <PROJECT-REF>`: the restored data brings the schedules back but
not the Vault secrets they call with, so until it runs every scheduled call fails. Then the new address and key in the
apps' `.env.local` files before building and uploading them again (`BACKEND.md`, "Upload the apps").

**Drill, Oct 17:** stable was backed up with the commands above (no password) and restored into a local Supabase
(`npx supabase start`). All 21 tables have exactly stable's row counts (553 guests, 664 seats, 1,604 change-log
entries), and the 15 sign-in accounts came across. The staff app ran against the copy: signed in as the demo gala
admin, its dashboard and activity log showed stable's data. The first try found two things, now in the commands above:
Supabase's own vector tables have to be left out of the data dump, and `roles.sql` holds a grant for Supabase's
realtime service that a local copy refuses. The backup files were deleted after the drill.

## Gala night

- **A week before:** confirm the project is running (not paused); take a backup; check the Usage page; remove people
  from Cloudflare Access who no longer need it; test a sign-in code. Send the QR e-ticket invitations days ahead, not
  the day of: on Resend's free plan about 100 go out a day (the Resend row above).
  - **The release, then a freeze:** `npx wrangler@4 pages deployment list --project-name aafe-gala-checkin` (and
    `aafe-gala-staff`, `aafe-gala-portal`) shows the release tag's commit on `main` for each app, and `backend.sql` was
    run from the same commit. After that, no `db:backend` and no uploads until after the gala.
  - **Door accounts:** each volunteer has their own `check_in_volunteer` row and a confirmed sign-in (`BACKEND.md`,
    "Add a staff member"). Don't rely on the email-domain sign-in for doors: it makes relationship managers, who see
    guests' emails and food and access answers, and it ends on its date.
  - **Badges:** Badges → the badge file for the printer (or Print sheet), print, then **Mark printed**. Leave
    sponsor-facing arrivals off (Gala information) unless AAFE's privacy review approved them.
- **The day before and that morning:** test a sign-in code again; don't change the Gmail account's password. Check the
  schedules ran recently: `select jobname, status, end_time from cron.job_run_details order by end_time desc limit 10;`.
  Check the email queue (Integrations & email) holds no failed or forgotten drafts. Write down who to call when
  something breaks (a gala admin who can reach the Supabase project) and give it to every door. It has to be a gala
  admin: only they read the change log (Activity log, Oct 22).
- **Before doors:** take a backup; download the check-in list (the staff app's iPad check-in page, `staff_export_checkin`)
  and print it as the fallback if every iPad fails. Sign every iPad in (`prototype/checkin-app/README.md`):
  1. In **Safari itself**, open the check-in address and pass Cloudflare's PIN (it expires in 10 minutes; each new
     person takes an Access seat).
  2. Share → **Add to Home Screen**, then open the "AAFE Check-in" icon. It keeps its own sign-in, separate from Safari.
  3. Sign in by **typing the 6-digit code**: the email's link opens Safari, not the Home Screen app.
  4. Leave it online on the door screen until it shows tonight's list, then leave it there.

  The iPads share the venue's internet address: sign-ins are limited to 30 per 5 minutes per address, and a second code
  to the same person needs a minute's wait.
- **During:** an iPad's pill says "Offline" when the internet is down (keep checking in: it saves on the iPad and
  syncs when back) and "Not syncing: ask a gala admin" when its sign-in needs attention (don't sign it out).
  - **Check-in:** a tap or a QR scan shows the guest's name, table and time with **Undo for 10 seconds**: check the
    name against the person in front of you. Later, tap the guest's row and Undo check-in; once it has synced, only
    the same sign-in or a gala admin can undo it.
  - **Scans:** a second scan of the same ticket says the guest is already checked in: don't admit it twice. An expired
    code: check the guest in by name. Walk-ins and unnamed sponsor seats go to **Exceptions**.
  - **Two doors, one guest:** the first arrival counts and the iPad says so; the change log records it for gala admins.
  - **"Not syncing" (for the gala admin):** check that sign-in's row in `staff_users` (its role, and `access_until`:
    email-domain rows stop at their date) and fix it in the SQL editor. The iPad keeps its check-ins meanwhile.
- **After check-in closes:** take a backup before anything else. Then make sure every iPad says it has nothing left to
  sync, then sign each one out: it keeps the door list until it does (`data-handling.md`). Collect the printed lists.
- **The weeks after:** download the Salesforce attendee file (Integrations & email) or run **Sync now**; then the
  retention steps (`BACKEND.md`, "After the gala"): food and access totals, then guests' contact details, by hand or
  by the daily sweep 60 days on. When the follow-up is done, close the gala in the SQL editor:
  `update gala_events set status = 'closed' where id = '<the gala id>';` (no app screen does this yet; `BACKEND.md`,
  "The current gala"). A closed gala clears every iPad's saved list. Closed too early (the iPad says the list was
  cleared): `update gala_events set status = 'live' where id = '<the gala id>';`. These two SQL edits write no line in
  the change log.
  - **A payment entered by mistake** (a check, ACH or wire; Give Lively payments are refunded in Give Lively): a gala
    admin opens **Payments & fees**, clicks **Void** on its row, types why, and confirms (#223, #264). Other roles
    don't see the button. The change log keeps who, when and why, and the order's status is worked out again from
    what's left. If the dialog says the payment was already sent to Salesforce, remove it there too. A wrong amount
    or date is fixed the same way: void it, then record it again on the sponsor's page.
  - **Checks taken at the door:** record them on the sponsor's page. The date is required and can't be more than 3 days
    ahead (#231); the form warns before the same check twice or an amount over the balance (#232).

The load test that backs this (six iPads, the full gala, offline stretches): `prototype/scripts/load-checkin.mjs`.

## Sources (read Oct 17, 2026)

1. [Supabase pricing](https://supabase.com/pricing)
2. [Supabase: free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
3. [Supabase: database backups](https://supabase.com/docs/guides/platform/backups)
4. [Supabase: billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
5. [Supabase: egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
6. [Supabase: database size](https://supabase.com/docs/guides/platform/database-size)
7. [Supabase: Cron quickstart](https://supabase.com/docs/guides/cron/quickstart)
8. [Gmail sending limits](https://support.google.com/mail/answer/22839)
9. [Google: app passwords](https://support.google.com/accounts/answer/185833)
10. [Resend pricing](https://resend.com/pricing)
11. [Resend: account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
12. [Cloudflare Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/)
13. [Cloudflare Access: seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/)
14. [Cloudflare Access: one-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
15. [Supabase: Edge Function invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)
16. [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
