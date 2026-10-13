# AAFE Gala — Backend

One Supabase project serves both apps. Each app gets its own API surface; neither app writes tables directly.

```
Give Lively ──(every 15 min)──▶ givelively-sync ──▶ gl_import() ──┐
Staff CSV upload ─────────────▶ staff_import_givelively() ─────────┤
                                                                   ▼
Guest Portal ──anon key──▶ portal_* functions ──▶  Postgres (schema.sql + backend.sql)  ◀── staff_* functions ◀── Staff App (login)
                                                                   │
                                          email_log drafts ─staff approve─▶ send-emails ──▶ Resend ──▶ sponsor / guest
```

| File | What it is |
|---|---|
| `database/backend.sql` | Security (RLS), Guest Portal API, Staff App API, Give Lively import, email queue. Run after `schema.sql` + `seed.sql`. Safe to re-run. |
| `database/cron.sql` | Schedules the two edge functions (pg_cron + pg_net). |
| `supabase/functions/givelively-sync` | Polls Give Lively's Zapier JSON endpoint and imports gala purchases. What it does with each donation is in `_shared/givelively-sync.ts`, so Node can test it. |
| `supabase/functions/send-emails` | Sends **staff-approved** emails (portal links, QR invitations) through Resend. Unapproved drafts never send (hard rule 4). |
| `supabase/functions/_shared/emails.ts` | The wording of every email (subject and HTML), as plain functions. `send-emails` uses them to send; the staff app can use the same ones to preview a draft before approving it. |
| `supabase/functions/givelively-mock` + `database/demo_givelively.sql` | **Demo only.** A fake Give Lively account with synthetic purchases. |
| `supabase/functions/_shared/givelively.ts` | Maps a Give Lively donation to our row shape and filters out non-gala donations. |
| `scripts/test-backend.mjs`, `scripts/test-access.mjs`, `scripts/test-emails.mjs`, `scripts/test-audit.mjs`, `scripts/test-offline-checkin.mjs`, `scripts/test-pipeline.mjs`, `scripts/test-arrivals.mjs`, `scripts/test-gala-2026.mjs`, `scripts/test-givelively.mts`, `scripts/test-givelively-sync.mts` | `npm run test:backend`, no Supabase account needed: the database and demo flows; the access rules for every table, view and function against every kind of caller, plus the sponsor link's limits; payment confirmations, reminders, the approval queue and the email wording; a change-log entry for every staff action (a new staff function fails until it is listed there); offline check-in end to end, with two iPads checking in the same guest; the sponsor pipeline from prospect to payment; sponsor-facing arrivals off and on; a full-size invented gala (553 guests, 2026-shaped) through the import into the database; the Give Lively mapping; and what the Give Lively sync does with each donation, run against `gl_import()` (other campaigns, unsettled payments, unreadable rows, re-polls that must not double anything). `scripts/test-db.mjs` is their shared in-memory database setup. Any failed check fails the run. |

## Setup

Where every key lives, and what stops a secret from reaching the browser or the repo: [`docs/keys-and-secrets.md`](../../docs/keys-and-secrets.md). In short, only the project URL and the anon key ever go in an app's `.env.local`; the service_role key stays in Supabase.

1. **Database.** Supabase dashboard → SQL editor: run `database/schema.sql`, then `seed.sql`, then `backend.sql`.
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
   `db query --linked` goes through your Supabase login, so no database password is needed or stored. `supabase link` keeps its state in `supabase/.temp/`, which git ignores.
   **Switch demo data sets** (decided Oct 7): `npm run db:load -- small`, `full-as-sent` or `full-fixed`. It **replaces** the demo data in the linked project with that set, in one transaction: it refuses if any gala is not marked synthetic (and the database itself refuses a real gala in a project that holds demo galas, or the reverse: demo and real data never share a project), keeps the staff list (test sign-in emails survive), then re-runs `backend.sql`. The staff app and portal have the same switch on their prototype banner (saved in the browser). Change the sets in `database/generate_seed.py` and `generate_full_seed.py` (`npm run seed`), never in the seed files.
2. **Staff logins.** Authentication → Providers: turn **off** "Allow new users to sign up". Authentication → Emails → **Magic Link** template: under the link, add `<p>Or type this code: <strong>{{ .Token }}</strong></p>`, and the same line in **Confirm signup** (a first sign-in uses it). Staff can then type the 6-digit code instead of opening the link: it signs in wherever they typed it, which the iPad's Home Screen app needs (its storage is separate from Safari), and a link only works in the browser that asked for it. To test a role without email, a one-time link made with Supabase's admin tools works too: `<app address>/?token_hash=<hashed_token>&type=<verification_type>` (`signInFromLink()` in `shared/src/supabase.ts`). Authentication → Users → **Invite** each staff member using the exact email in `staff_users`. Login is matched to the role by email. Demo seed emails are `@aafe-demo.example.org`, so change them to real team inboxes (`update staff_users set email = ...`) to test. Then copy `staff-app/.env.example` to `staff-app/.env.local` with the project URL and anon key: the Staff App's login page switches from demo accounts to an emailed one-time sign-in link, and an email not in `staff_users` is signed straight back out. Authentication → URL Configuration: add the Staff App's address (e.g. `http://localhost:5174/`) and the iPad check-in app's (e.g. `http://localhost:5175/`) to the redirect URLs. The iPad app takes the same two settings in `checkin-app/.env.local` (`checkin-app/.env.example`); see `checkin-app/README.md`.
3. **Edge functions.**
   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT-REF>
   npx supabase secrets set \
     GIVELIVELY_ORG_ID=... GIVELIVELY_API_KEY=... \
     RESEND_API_KEY=... EMAIL_FROM="AAFE Gala <gala@your-verified-domain>" \
     GUEST_PORTAL_URL=https://<guest-portal-host>/ CRON_SECRET=<long random string>
   npx supabase functions deploy givelively-sync
   npx supabase functions deploy send-emails
   ```
4. **Schedules.** Fill in the two values at the top of `database/cron.sql` and run it.
5. **Check.** `select * from givelively_sync_state;` shows the last poll. `select * from email_log where status = 'queued' and approved_at is null;` shows drafts waiting for staff approval.

**Every email needs staff approval** (team hard rule 4). Give Lively purchases, pledges and recorded payments create a *draft* guest-list email, and staff approve it (`staff_approve_email`) or discard it (`staff_cancel_email`). A staff member sending their own email ("send new link", QR invite) counts as the approver, and both are logged. Sponsor links expire at the end of the order's guest-list deadline day (New York time).

The approval screen calls `staff_email_queue()`: every unsent email, drafts first, each with its state (`draft`, `approved` and waiting for the sender, or `failed` after 5 attempts with the error), the sponsor and package, unnamed seats and deadline, and for a payment confirmation the payment it confirms.

- **Payment confirmation** (`payment_receipt`): `staff_record_payment` drafts one for every check, ACH or wire payment staff record. It states the amount, date and balance, and says it is not a tax receipt (Give Lively sends its own receipts for online purchases).
- **Guest-list reminder** (`guest_list_reminder`): `staff_queue_guest_list_reminders(p_min_days default 7)` drafts one for each sponsor of the current gala who still has unnamed seats, already got a link, and whose deadline hasn't passed. It skips sponsors with a link or reminder still waiting, or one sent in the last `p_min_days` days. A reminder carries a fresh private link, so the newest email always has the one that works. If every seat gets named before it goes out, the sender refuses it and it shows as failed for staff to discard.

Until `RESEND_API_KEY` is set, approved emails wait in the queue and nothing is sent. A guest-list link or reminder for an order whose deadline has passed can't be approved (it would arrive expired): extend that order's deadline first (`staff_set_order_deadline`), and the sender refuses one whose deadline passed after approval. Once Resend accepts an email, saving that is retried and never counts as a failed send, so a database hiccup can't send a second email whose new link replaces the first. Each `send-emails` run claims its batch first (`email_claim()`), so the every-minute schedule and a manual "send now" never send the same email twice or replace a link a sponsor already received. A claim older than 10 minutes, from a run that stopped mid-send, is released for the next run. Until the Give Lively secrets are set, the poller returns `not_configured`.

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

**Run the demo:**
```bash
F=https://<PROJECT-REF>.supabase.co/functions/v1
H="x-cron-secret: <CRON_SECRET>"
# (optional) a sponsor buys a table "live"
curl -X POST $F/givelively-mock/purchase -H "$H" -H 'Content-Type: application/json' \
  -d '{"company":"Golden Gate Tea (synthetic)","first":"Wei","last":"Zhang","email":"wei@goldengate.example.org","ticket_level":"Gold — Documentary Screening Sponsor","amount":25000}'
curl -X POST $F/givelively-sync -H "$H"    # import now (otherwise within 15 min)
# staff approve the drafts (until the Staff App is connected, run this in the SQL editor):
#   update email_log set approved_by = 'Demo approver', approved_at = now() where status = 'queued' and approved_at is null;
curl -X POST $F/send-emails     -H "$H"    # send approved emails now (otherwise within 1 min)
```
Open the email in your inbox and click **Add or update guest names**. The Guest Portal shows the sponsor, the package, the paid amount and the empty seats, all of which came from the fake Give Lively purchase.

The flow is tested in `npm run test:backend` (fake feed → mapping → import → Guest Portal view).

**For real AAFE use:** don't run `demo_givelively.sql` or deploy `givelively-mock`. Remove `GIVELIVELY_BASE_URL` and `EMAIL_REDIRECT_TO`.

## Demo with a stand-in Salesforce (all synthetic)

Give Lively's own Salesforce connector sends its online donations to AAFE's Salesforce (NPSP). `salesforce-push` sends what Give Lively doesn't know, for the current gala (`salesforce_outbox()` in `backend.sql`, mapped by `_shared/salesforce.ts`):

| Here | Salesforce |
| --- | --- |
| The gala | Campaign |
| A sponsor with a check, ACH, wire, comp or staff-entered order | Account |
| That order (not Give Lively's) | Opportunity, in the gala's Campaign; paid and comp are Closed Won, cancelled Closed Lost, the rest Pledged |
| A check, direct ACH or wire payment staff recorded | `npe01__OppPayment__c` |
| Every named guest, Give Lively buyers' guests included | Contact (name and email), and a Campaign Member: Registered, Attended or No Show |

No phones, dietary or accessibility details are sent. Records are upserted on our ids in a custom external-ID field, `AAFE_Gala_Id__c`, so a second sync updates them instead of adding duplicates, and a record whose parent is missing fails on its own while the rest go through. Each record's outcome is kept in `salesforce_sync`, the Account and Opportunity ids on the sponsor and order (the CSV export reads them), and one change-log line per run. A gala admin runs it from the staff app (Integrations, **Sync now**). Tested in `npm run test:backend` (`scripts/test-salesforce.mts`).

In the demo it goes to `salesforce-mock`, a stand-in org that answers Salesforce's sObject Collections upsert and keeps the records in `demo_salesforce_records`; it never talks to a real org (requirements: Salesforce push, simulated).

1. In the SQL editor (after `backend.sql`), run `database/demo_salesforce.sql`.
2. Deploy and point the push at the stand-in:
   ```bash
   npx supabase functions deploy salesforce-mock
   npx supabase functions deploy salesforce-push
   npx supabase secrets set SALESFORCE_BASE_URL=https://<PROJECT-REF>.supabase.co/functions/v1/salesforce-mock      SALESFORCE_TOKEN=<any made-up string>
   ```
3. **Sync now** on Integrations, or `curl -X POST $F/salesforce-push -H "$H"` (as above). Then `select sobject, count(*) from demo_salesforce_records group by 1;` shows what "Salesforce" holds.

**For real AAFE use:** don't run `demo_salesforce.sql` or deploy `salesforce-mock`. AAFE's org needs the `AAFE_Gala_Id__c` field (Text, External ID, Unique) on Campaign, Account, Opportunity, `npe01__OppPayment__c`, Contact and Campaign Member, and a connected app for the access token; then `SALESFORCE_BASE_URL` is the org's instance URL. Check first how Give Lively's connector names Accounts and Contacts, so the two don't create duplicates.

## Give Lively

- **Credentials.** An AAFE admin creates the Zapier API key in the Give Lively Nonprofit Admin Portal. The org ID and key go into the URL `secure.givelively.org/nonprofits/<ORG_ID>/json_dataclips/<API_KEY>.json`, so treat that URL as a password. The function never logs it.
- **Only gala sales.** The endpoint returns *all* of AAFE's donations. Only donations from this gala's Give Lively page are imported: `gala_events.givelively_page_name` (e.g. "AAFE's 52nd Annual Gala"), matched exactly, set once a year by an admin (`staff_set_gala_page`). Not set: the sync does nothing and says so. `demo_givelively.sql` sets it to "AAFE Gala 2027" for the fake account.
- **Field names are not documented by Give Lively.** The mapping in `_shared/givelively.ts` follows the "Line Items (All)" report names and tolerates snake_case, nesting and amounts in cents. **Before launch, run one poll against AAFE's account and check `select * from givelively_raw where import_status = 'unmapped';`.** Any row there means a field name needs adding to `FIELDS`.
- **Rules.**
  - No duplicates: a purchase is matched on its purchase key (buyer email + UTC purchase time), or its Give Lively transaction ID when the sync has one.
  - Refunds update the existing payment and flag it for review.
  - Only a full refund cancels an order: by amount, or a status that says "Refunded" and nothing more. "Partially Refunded" keeps the order and its seats, as partly paid (import spec case 19).
  - Pending bank payments are skipped until Give Lively reports them settled.
  - A purchase that fails after it was imported (a bounced ACH, a cancelled or declined donation) is cancelled, as the CSV import does: the order, its seats and any unsent guest-list link, with a staff review item. A failed donation that was never imported creates nothing.
  - The sync and the CSV upload use the same failure words (failed, declined, cancelled, voided, reversed, returned), so one donation can't be live in one and cancelled in the other.
  - Give Lively's own fee is stored as reported and never recomputed.
- **Flagged for review** (`payments.reconciliation_status = 'needs_review'`, reason in `orders.internal_notes`):
  - (an unknown package no longer defaults to Community Ticket: nothing is created, and it goes to `import_review` as `unknown_tier`)
  - the payment method wasn't recognized
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

Never returned: payment method, fees, check numbers, internal notes, relationship owner or notes, and other orders. A seat whose guest is checked in can't be edited (`seat_locked`).

## Staff App API (logged-in users)

Reads: `gala_admin` and `relationship_manager` can `select` every table directly (RLS). `check_in_volunteer` can't read tables. Volunteers use `checkin_list()`.
Writes: only through these functions, and each one writes `audit_log`. `audit_log` can't be updated or deleted.
**Guest names (Oct 10).** `guests.display_name` is the guest's name as written: badges, the check-in list, the door list, exports and the portal print it. `first_name` and `last_name` are a best guess for sorting and search, from the name engine (`import-engine/src/names.ts`). `portal_save_guest`, `staff_update_guest` and `staff_add_comp_guest` take a `display_name`, first and last, or both; `name_parts()` fills in whatever is missing (a full name alone falls back to last word = last name). A one-word name is allowed, with an empty last name. A display name that's just "First Last" follows a new first or last name; one staff corrected stays. Salesforce gets the last name, or the whole name when there is no last name.

Guest edits (`staff_update_guest`, and a sponsor editing a named guest through `portal_save_guest`) also record the old and new value of each changed field in `audit_log.changes`, e.g. `{"title": {"from": "Manager", "to": "Director"}}`. It's for staff: the portal's activity list shows only the summary. Status changes, seating, and payment amounts keep using `from_state` and `to_state`.

| Prototype (`staff-app/src/store.ts`) | Backend call | Roles |
|---|---|---|
| (login) | `rpc('staff_me')` → `{ id, name, email, role }` or null | all |
| `updateGuest` | `staff_update_guest(p_guest_id, p_patch)` | admin, RM |
| `setSeatStatus` | `staff_set_seat_status(p_guest_id, p_to)`, enforcing submitted→reviewed→badge_ready (needs table+seat) | admin, RM |
| `markPrinted` | `staff_mark_printed(p_guest_ids)` | admin, RM |
| `assignSeat` | `staff_assign_seat(p_guest_id, p_table_id, p_seat)`; null table = unseat; `seat_taken` if occupied | admin, RM |
| `seatOrderAtTable` | `staff_seat_order_at_table(p_order_id, p_table_id)` | admin, RM |
| `recordOfflinePayment` | `staff_record_payment(p_order_id, p_method, p_amount, p_received, p_check_number)` | admin, RM |
| `addPledge` | `staff_add_pledge(p_org, p_contact, p_email, p_tier_id, p_source)` | admin, RM |
| `addCompGuest` | `staff_add_comp_guest(p_guest)` | admin, RM |
| `sendQrInvite` | `staff_send_qr_invite(p_guest_id)`; approved by the sender, and logged as `email.approved` in their name. The guest needs a seat and an email; the code is minted when it sends | admin, RM |
| `resendPortalLink` | `staff_resend_portal_link(p_order_id)`; approved by the sender, and logged as `email.approved` in their name; the old link stops working | admin, RM |
| `checkIn` | `staff_check_in(p_guest_id, 'search')` or `staff_check_in_qr(p_code)` | all |
| `checkInException` | `staff_check_in_exception(p_name, p_order_id, p_type, p_note)` | all |
| Check-in → save the list for offline use (new) | `staff_checkin_snapshot()`: every guest with table, seat, accessibility needs, arrival, and their QR code's hash; no email, phone, payment, dietary needs or notes. A read, not logged | all |
| Check-in → sync offline check-ins (new) | `staff_sync_check_ins(p_items)`: see "Offline check-in" below | all |
| Check-in → undo (Oct 8) | `staff_undo_check_in(p_id)`: the check-in's id or the iPad's `client_id`. Only the staff member who made it (by account) or a gala admin; the guest goes back to expected and the seat to its status before check-in; logged as `checkin.undone` | all (own check-ins); admin (any) |
| Sponsors → pipeline board (new) | `staff_pipeline()`: totals per stage against the goal, and every prospect with its ask, commitment, money received, balance, and the last two galas' giving; no emails or phones. A read, not logged | admin, RM |
| Sponsors → add or edit a prospect (new) | `staff_save_prospect(p)`: `{ id? , sponsor_id? or organization + contact_name, sector, ask_amount, ask_tier_id, follow_up_owner_id, notes, order_id? }` | admin, RM |
| Sponsors → move a prospect (new) | `staff_set_prospect_stage(p_id, p_stage)` | admin, RM |
| Sponsors → set the goal (new) | `staff_set_sponsorship_goal(p_amount)` | admin |
| Gala info → save (new) | `staff_update_gala_event(p_patch)`: name, date, doors and program times, venue, address, dress code and the two deadlines; nothing else. Logged with the old and new value of each field | admin |
| Sponsors → logo or program ad status (new) | `staff_set_material_status(p_order_id, p_material, p_status)`: `logo` or `program_ad`; `not_required`, `pending`, `received` or `approved` | admin, RM |
| Gala info → sponsor arrivals on/off (new) | `staff_set_sponsor_arrivals(p_on, p_note)`: off by default; switching on needs a note recording AAFE's privacy approval (who and when). See "Gala-night arrivals" below | admin |
| `importGiveLively` (CSV) | `staff_import_givelively(p_rows)` | admin |
| Sponsors → an order's guest-list deadline (new, Oct 12; screen to come) | `staff_set_order_deadline(p_order_id, p_deadline)`: for a sponsor who bought after the gala's deadline or needs more time; a link already sent moves with it; not after the gala; logged | admin |
| Integrations "Pull now" | `functions.invoke('givelively-sync')` | admin |
| Integrations "Sync now" (Salesforce) | `functions.invoke('salesforce-push')` | admin |
| Approve / discard a draft email | `staff_approve_email(p_email_id)` / `staff_cancel_email(p_email_id)` | admin, RM |
| List unsent emails for the approval screen | `staff_email_queue()` | admin, RM |
| Draft guest-list reminders | `staff_queue_guest_list_reminders(p_min_days)` | admin, RM |
| Send approved email now | `functions.invoke('send-emails')` | admin, RM |
| Badges → "CSV for printer" | `staff_export_badges(p_include_printed default false)`: ready and reprint badges, sorted by table and seat; the name as written (`display_name`) plus first and last; badge fields only (no email, dietary, payment, or notes) | admin, RM |
| Check-in → printed list (new) | `staff_export_checkin()`: every guest by last name plus one row per unnamed sponsor seat, with table, seat, and arrived; no email or dietary needs | all |
| Integrations → Salesforce file (new) | `staff_export_salesforce()`: one row per arrival (walk-ins included) with email, Salesforce Account and Opportunity ids, and arrival time | admin |

Each export writes `audit_log` (`export.badges`, `export.checkin`, `export.salesforce`) with the row count. They return rows; the staff app saves them with `downloadCsv` (`shared/src/ui.tsx`), which already blocks spreadsheet formulas and keeps Chinese and Korean names readable in Excel. The columns are a first proposal until AAFE sends its badge and check-in templates.

### Gala-night arrivals for sponsors

Decided Oct 6: sponsors see which of their own guests have arrived, once AAFE's privacy review approves it. Until then it is **off** (`gala_events.sponsor_arrivals_visible`), and the portal shows nothing about arrivals: a checked-in seat reads as `badge_ready`, and a seat locked by check-in says only that it can no longer be changed online.

When a gala admin switches it on (`staff_set_sponsor_arrivals(true, 'Approved by … on …')`), `portal_get_view` adds:
- `arrivals`: `{ arrived, expected, walkIns }` for this sponsor's seats only (`null` while off);
- `seats[].arrived`: `true` or `false` for each named seat; seat status `checked_in` is shown as is.

Never a time, a staff name, a door, or a walk-in's name. Check-ins never appear in the sponsor's activity list. Switching on or off is logged, with the approval note.

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

1. While online, save the list: `desk.saveSnapshot(await rpc('staff_checkin_snapshot'))`. Refresh it every few minutes.
2. At the door, online or not: `desk.scan(code)`, `desk.checkIn(guestId)`, `desk.checkInException({ name, order_id, type, note })`. Every check-in is saved on the iPad first. A QR code is checked against the saved hashes, so scanning works offline.
3. When online: `desk.sync((items) => rpc('staff_sync_check_ins', { p_items: items }))`.
4. Banner: `desk.banner(navigator.onLine)` gives "Offline · 3 check-ins waiting". Conflicts and refused items are in `desk.notices()`.
5. After gala night: `desk.clear()`.

**First arrival wins.** One check-in per guest (enforced by a unique index). If two doors check in the same guest, the earliest check-in stands, even if it syncs later. The other is written to the change log as `checkin.conflict` ("already checked in at 7:04 PM by Kenji Abe (Door 2); a second check-in at 7:06 PM … was not counted"), and the iPad shows it as a notice. Each check-in carries the iPad's id for it (`client_id`), so sending the same batch twice records nothing twice. The iPad's time is kept (never later than the server's clock).

Errors come back as the Postgres message: `forbidden`, `not_found`, `invalid_link`, `invalid_input: …`, `invalid_transition: …`, `seat_taken`, `seat_locked: …`.

## Changes to the schema (all in `backend.sql`)

- **The current gala** (`current_event_id()`, Oct 12): the gala marked live; else the soonest one dated from 30 days ago on, so a gala stays current for a month after its date (results, the Salesforce export, late check-in fixes); else the newest not closed. Creating next year's gala in planning no longer takes check-in, imports and exports away from this year's before it's closed. Close a gala when its follow-up is done.

- New tables: `givelively_sync_state` (poll cursor and last result) and `givelively_raw` (every gala donation as Give Lively sent it).
- New `email_log` columns: `attempts`, `last_error`, `approved_by` and `approved_at`. New status: `cancelled`.
- New unique index on `payments.givelively_transaction_id`.
- New `check_ins` columns `client_id` (unique) and `device`, and one check-in per guest per gala (unique index).
- New table `sponsor_prospects` and `gala_events.sponsorship_goal`; a trigger on `orders` keeps the pipeline in step.
- New `gala_events` columns `sponsor_arrivals_visible` (default off) and `sponsor_arrivals_note`.
- `orders.portal_token` now holds a hash. The seed's demo links (`ac-6w9k3p5d`, etc.) still work.
- The `audit_log` and `salesforce_sync` id counters are moved past the seed's ids (fixes a duplicate-key error on the first new audit row).

## Not done yet

- **Guest Portal is connected** when `guest-portal/.env.local` is set, and runs offline on the synthetic data when it isn't (the `OPEN-*.html` files). The landing page's demo cards still come from the built-in data. Their links work against the backend only if `seed.sql` was loaded.
- **Staff App is connected** when `staff-app/.env.local` is set (issues #8, #9). Every page action goes through `staff-app/src/api.ts`: one `staff_*` call from the table above, then a reload of what the role may read. Gala admins and relationship managers read the tables (RLS); a check-in volunteer loads only `staff_checkin_snapshot()`, with no emails, phones, payments, notes or QR codes. Without the env file the same actions run on the demo data with the same role rules.
  - Live, Sponsors shows "Resend portal link" only (links are stored hashed, so there is nothing to copy), and relationship guests show their invitation status instead of a QR code.
  - Live, the Give Lively "Pull now" on Integrations (gala admins) runs `givelively-sync` right away, as the 15-minute schedule does, and shows its counts or its reason when it can't run (secrets or the gala's page name not set). It needs the function deployed (step 3).
  - Still simulated in both modes: the CSV import on Integrations (live CSV imports go through the Import page).
- **QR e-tickets (hard rule 6).** A code is minted only when an approved `qr_invitation` email sends; the database keeps its SHA-256 hash on the guest's seat (`seats.qr_token_hash`), valid until 6 a.m. New York time the morning after gala night. Resending replaces the code; a different guest on the seat, a name or email change, or a cancelled seat voids it. Staff can't display a code, only resend it. The seed's QR codes are moved onto seats as hashes when `backend.sql` runs. The seed's demo sponsor links are short (8 characters), fine for the demo but below rule 6's 128 bits; real links are minted at 128 bits by `send-emails`.
- **Email.** Templates (`_shared/emails.ts`) are in English: the guest-list link, guest-list reminders, payment confirmations, and QR invitations. The portal page itself has 中文, 한국어, and Español. Reminders are drafted when staff ask (`staff_queue_guest_list_reminders`), not on a schedule.
- **Salesforce.** A stand-in only (the demo never talks to a real org): see "Demo with a stand-in Salesforce". `staff_export_salesforce()` gives a file shaped for a Contact and Campaign Member import, the real deliverable until AAFE connects its org.
- **Edge functions** are type-checked in CI (`deno check`) and their logic is tested in Node (email wording, the Give Lively sync's per-donation rules), but they haven't run on Supabase yet: test them after the first deploy.
