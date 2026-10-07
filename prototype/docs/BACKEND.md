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
   `db query --linked` goes through your Supabase login, so no database password is needed or stored. `supabase link` keeps its state in `supabase/.temp/`, which git ignores.
2. **Staff logins.** Authentication → Providers: turn **off** "Allow new users to sign up". Authentication → Users → **Invite** each staff member using the exact email in `staff_users`. Login is matched to the role by email. Demo seed emails are `@aafe-demo.example.org`, so change them to real team inboxes (`update staff_users set email = ...`) to test.
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

Until `RESEND_API_KEY` is set, approved emails wait in the queue and nothing is sent. Until the Give Lively secrets are set, the poller returns `not_configured`.

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

## Give Lively

- **Credentials.** An AAFE admin creates the Zapier API key in the Give Lively Nonprofit Admin Portal. The org ID and key go into the URL `secure.givelively.org/nonprofits/<ORG_ID>/json_dataclips/<API_KEY>.json`, so treat that URL as a password. The function never logs it.
- **Only gala sales.** The endpoint returns *all* of AAFE's donations. Only donations from this gala's Give Lively page are imported: `gala_events.givelively_page_name` (e.g. "AAFE's 52nd Annual Gala"), matched exactly, set once a year by an admin (`staff_set_gala_page`). Not set: the sync does nothing and says so. `demo_givelively.sql` sets it to "AAFE Gala 2027" for the fake account.
- **Field names are not documented by Give Lively.** The mapping in `_shared/givelively.ts` follows the "Line Items (All)" report names and tolerates snake_case, nesting and amounts in cents. **Before launch, run one poll against AAFE's account and check `select * from givelively_raw where import_status = 'unmapped';`.** Any row there means a field name needs adding to `FIELDS`.
- **Rules.**
  - No duplicates: a purchase is matched on its purchase key (buyer email + UTC purchase time), or its Give Lively transaction ID when the sync has one.
  - Refunds update the existing payment and flag it for review.
  - Pending or failed bank payments are skipped until Give Lively reports them settled.
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
| Sponsors → pipeline board (new) | `staff_pipeline()`: totals per stage against the goal, and every prospect with its ask, commitment, money received, balance, and the last two galas' giving; no emails or phones. A read, not logged | admin, RM |
| Sponsors → add or edit a prospect (new) | `staff_save_prospect(p)`: `{ id? , sponsor_id? or organization + contact_name, sector, ask_amount, ask_tier_id, follow_up_owner_id, notes, order_id? }` | admin, RM |
| Sponsors → move a prospect (new) | `staff_set_prospect_stage(p_id, p_stage)` | admin, RM |
| Sponsors → set the goal (new) | `staff_set_sponsorship_goal(p_amount)` | admin |
| Gala info → sponsor arrivals on/off (new) | `staff_set_sponsor_arrivals(p_on, p_note)`: off by default; switching on needs a note recording AAFE's privacy approval (who and when). See "Gala-night arrivals" below | admin |
| `importGiveLively` (CSV) | `staff_import_givelively(p_rows)` | admin |
| Integrations "Pull now" | `functions.invoke('givelively-sync')` | admin |
| Approve / discard a draft email | `staff_approve_email(p_email_id)` / `staff_cancel_email(p_email_id)` | admin, RM |
| List unsent emails for the approval screen | `staff_email_queue()` | admin, RM |
| Draft guest-list reminders | `staff_queue_guest_list_reminders(p_min_days)` | admin, RM |
| Send approved email now | `functions.invoke('send-emails')` | admin, RM |
| Badges → "CSV for printer" | `staff_export_badges(p_include_printed default false)`: ready and reprint badges, sorted by table and seat; badge fields only (no email, dietary, payment, or notes) | admin, RM |
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
- **Staff App still uses in-memory data.** To connect it:
  - Swap `staff-app/src/store.ts` and `Login.tsx` to the calls above.
  - Sponsors → "copy portal link" becomes "send new link", because tokens are stored hashed.
- **QR e-tickets (hard rule 6).** A code is minted only when an approved `qr_invitation` email sends; the database keeps its SHA-256 hash on the guest's seat (`seats.qr_token_hash`), valid until 6 a.m. New York time the morning after gala night. Resending replaces the code; a different guest on the seat, a name or email change, or a cancelled seat voids it. Staff can't display a code, only resend it. The seed's QR codes are moved onto seats as hashes when `backend.sql` runs. The seed's demo sponsor links are short (8 characters), fine for the demo but below rule 6's 128 bits; real links are minted at 128 bits by `send-emails`.
- **Email.** Only `portal_link` and `qr_invitation` templates are built, in English (the portal page itself has 中文 and Español). Scheduled deadline reminders and payment receipts aren't built.
- **Salesforce.** No direct sync (out of scope in the project scope doc). `staff_export_salesforce()` gives a file shaped for a Contact and Campaign Member import instead.
- **Edge functions** haven't been run yet. Deno wasn't available when they were written, so test them after the first deploy. The SQL and the Give Lively mapping are tested.
