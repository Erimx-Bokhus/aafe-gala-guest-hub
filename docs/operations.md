# Running the tool: free-plan limits, backups, gala night

The prototype runs on free plans: Supabase (two projects, stable and nightly, in one free organization), Cloudflare
Pages and Access, and a team Gmail account that sends the sign-in codes. This page lists what could stop it, how to
prevent each thing and how to recover, how to take and restore a backup, and a checklist for gala night. Gate 3 of
v1.0 (#149); limits read from the providers' pages on Oct 17, 2026 (sources at the end).

## Before going live: what still points at the team

- **Emails go to the team.** Since Oct 18 stable and nightly send approved emails through Resend, from a team member's
  account with no verified domain, so every email is redirected to that team member's inbox. Sign-in codes are separate:
  Supabase sends them through the Gmail account.
- **The schedules run** (`prototype/database/cron.sql`, on both projects): since Oct 18 the Give Lively poll every 15
  minutes and the email sender every minute, and since Oct 19 the daily retention sweep.

To run for real: Resend with AAFE's own domain, AAFE's own function secrets (`BACKEND.md`, Setup step 3), and AAFE's
Supabase and Cloudflare accounts (`decisions.md`, Oct 17).

## Risks

| Risk | Limit | What it means here | Prevent | Recover |
| --- | --- | --- | --- | --- |
| **The project pauses** | A free project with little database activity for 7 days is paused; the owner gets an email about a week before. A paused project can be restored for up to a year ([1], [2]) | Over a quiet stretch (Thanksgiving, after the Nov 10 handoff) everything stops: the apps, the poll, the emails. Before the 2027 gala it will have paused unless someone kept it awake | Someone reads the project owner's inbox. Use the apps weekly. Check the project is running a week before every review, Demo Day and the gala | Supabase dashboard → the project → **Resume project**; data and settings come back. How long it takes isn't published: resume early |
| **No backups** | The free plan has no daily backups and no point-in-time restore ([1], [3]) | A wrong SQL statement, a wrong `db:load` or a deleted project can't be undone. Gala-night check-ins live only in the database and on the iPads | Our own backup (below), weekly and before every event | Restore from that backup (below), or Pro ($25 a month) for 7 daily backups |
| **Two free projects** | Two active free projects across the organization's owners and admins; paused ones don't count ([4]) | Stable and nightly use both slots, so a new project (for a restore, or AAFE's) can't be made | Keep the owner and admin roles to who needs them | Pause nightly to free a slot |
| **5 GB of data a month** | Shared by the whole organization. Over it: a notice, a grace period, then restrictions; after one grace period the next overage gets none ([1], [4], [5]) | Measured on the 553-guest gala: the **staff app** loads everything once, 1.1 MB (99 KB compressed), then every 10 s fetches only what changed since (`staff_sync`, Oct 17): about 0.6 KB when nothing did, about 1.4 KB per check-in, and everything again every 4 hours. One tab on gala night: **under 1 MB an hour** (it was 128 MB reloading everything every 30 s). A check-in volunteer in the staff app still gets the whole door list every 30 s. The **iPad** fetches its list (281 KB, 27 KB compressed) once a minute since Oct 17, 16 MB an hour each. Whether Supabase counts compressed bytes isn't published | Check the Usage page weekly and before events | Wait for the next billing month, or Pro (250 GB) |
| **500 MB database** | Read-only above it ([6]) | Small today. Once the schedules run, `cron.job_run_details` grows by about 1,540 rows a day and is never cleaned ([7]) | `cron.sql` now deletes run history older than a week | Delete old rows and vacuum; [6] explains how to leave read-only mode |
| **Sign-in codes through Gmail** | More than 500 emails a day blocks sending for up to a day ([8]); the app password stops working when the Google password changes ([9]) | Volume is fine. A password change silently stops every sign-in code | Don't change that Google password near an event; test a sign-in code the day before and the morning of | Make a new app password and put it in Supabase → Authentication → Emails → SMTP |
| **Resend's free plan** (AAFE's project) | 100 emails a day, 3,000 a month; `resend.dev` only sends to your own address ([10], [11]) | Sign-in codes, guest-list links, reminders and QR invitations share 100 a day: QR e-tickets for 550 guests take six days | Verify AAFE's domain; Resend Pro ($20 a month) for the gala months, or spread the sends over days | Wait for the next day (8 p.m. New York) or upgrade |
| **Cloudflare Access: 50 people** | A person takes a seat at their first sign-in and keeps it until removed; when 50 are taken, new people are refused. A code expires in 10 minutes ([12], [13], [14]) | The team, AAFE's reviewers, Pursuit's advisors and the volunteers share 50 seats. Since Oct 19 anyone at @aafe.org or @pursuit.org can sign in, and each one who does takes a seat. **The sponsor portal is behind Access too** (`cf-lockdown.mjs`), fine for the prototype, but for AAFE's real gala every sponsor would need a seat | Remove people who no longer need access. For the real gala, take the portal out from behind Access: its private link is the sponsor's credential | Zero Trust → Users → remove; the person asks for a new code |
| **Other Supabase quotas** | 500,000 Edge Function calls and 50,000 monthly sign-ins a month; logs kept one day ([1], [15]) | The two schedules would use about 95,000 calls a month across both projects | Look into a gala-night problem that same night: the logs are gone the next day. The change log (`audit_log`) keeps our own history | — |

Cloudflare Pages is no risk: 500 builds a month, 20,000 files of up to 25 MB, unlimited requests ([16]); our builds
are 21 files, the largest 3.2 MB.

## Who can open the apps

Two locks, one after the other:

1. **Cloudflare Access**, in front of all three addresses: an email PIN, then the browser stays signed in for about a
   month (730 hours). Since Oct 19 it lets in anyone with an **@aafe.org or @pursuit.org** address, plus Natalie's two
   personal addresses (`decisions.md`). Nobody else reaches the apps at all.
2. **The app's own sign-in**: a 6-digit code by email, only for people on the staff list (`BACKEND.md`, "Add a staff
   member"). This is the lock that decides roles; it stays signed in until the person signs out.

So a new person's first day takes two emails (Cloudflare's PIN, then the app's code); after that it is one PIN a month.

**Later options, not done (for the handoff or the real gala):**

| Option | What changes | Trade-off |
| --- | --- | --- |
| Take Access off the staff and iPad apps | One login: the app's own code. The portal stays behind Access | The two addresses are public; anyone can reach the sign-in page, and only invited staff get a code. Gala-night iPads lose the extra lock |
| Take Access off all three | One login for staff; sponsors open the portal straight from their private link, as they would for the real gala (the Access row above) | Anyone who finds the portal address sees its landing page, whose demo links open the invented sponsors' guest lists and let them be edited, so the demo links would need to come off first |

Either is one change in Zero Trust → Access → Applications (or `cf-lockdown.mjs`), and can be undone the same way.

## Backups

The CLI takes a backup through your Supabase login: **no database password is needed** (it makes a temporary login
role). It needs Docker running. In `prototype/` (or `D:\aafe-gala-nightly\prototype` for nightly), check the target
with `cat supabase/.temp/project-ref`, then:

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

**Restore** into an empty project (a new one, or a local `npx supabase start`). The database URL comes from that
project's Connect panel (or `npx supabase status` locally):

```bash
psql --file roles.sql --dbname "$DB_URL"     # role settings; a local copy refuses its one realtime grant, which is harmless
psql --single-transaction --variable ON_ERROR_STOP=1 --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql --dbname "$DB_URL"
```

Then, for a hosted project: the Vault secrets and schedules (`cron.sql`), the function secrets and deploys and the Auth
settings (`BACKEND.md`, Setup steps 2 and 3), and the new address and key in the apps' `.env.local` files before
building and uploading them again.

**Drill, Oct 17:** stable was backed up with the commands above (no password) and restored into a local Supabase
(`npx supabase start`). All 21 tables have exactly stable's row counts (553 guests, 664 seats, 1,604 change-log
entries), and the 15 sign-in accounts came across. The staff app ran against the copy: signed in as the demo gala
admin, its dashboard and activity log showed stable's data. The first try found two things, now in the commands above:
Supabase's own vector tables have to be left out of the data dump, and `roles.sql` holds a grant for Supabase's
realtime service that a local copy refuses. The backup files were deleted after the drill.

## Gala night

- **A week before:** confirm the project is running (not paused); take a backup; check the Usage page; remove people
  from Cloudflare Access who no longer need it; test a sign-in code.
- **The day before and that morning:** test a sign-in code again; don't change the Gmail account's password.
- **Before doors:** take a backup; sign every iPad in (they share the venue's internet address, and sign-ins are limited
  to 30 per 5 minutes per address); leave each iPad on the door screen.
- **During:** an iPad's pill says "Offline" when the internet is down (keep checking in: it saves on the iPad and
  syncs when back) and "Not syncing: ask a gala admin" when its sign-in needs attention (don't sign it out).
- **After check-in closes:** take a backup before anything else.

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
