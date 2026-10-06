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
| `supabase/functions/givelively-sync` | Polls Give Lively's Zapier JSON endpoint and imports gala purchases. |
| `supabase/functions/send-emails` | Sends **staff-approved** emails (portal links, QR invitations) through Resend. Unapproved drafts never send (hard rule 4). |
| `supabase/functions/givelively-mock` + `database/demo_givelively.sql` | **Demo only.** A fake Give Lively account with synthetic purchases. |
| `supabase/functions/_shared/givelively.ts` | Maps a Give Lively donation to our row shape and filters out non-gala donations. |
| `scripts/test-backend.mjs`, `scripts/test-givelively.mts` | `npm run test:backend`: 51 database and demo-flow checks + mapping checks, no Supabase account needed. |

## Setup

1. **Database.** Supabase dashboard → SQL editor: run `database/schema.sql`, then `seed.sql`, then `backend.sql`.
2. **Staff logins.** Authentication → Providers: turn **off** "Allow new users to sign up". Authentication → Users → **Invite** each staff member using the exact email in `staff_users`. Login is matched to the role by email. Demo seed emails are `@aafe-demo.example.org`, so change them to real team inboxes (`update staff_users set email = ...`) to test.
3. **Edge functions.**
   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT-REF>
   npx supabase secrets set \
     GIVELIVELY_ORG_ID=... GIVELIVELY_API_KEY=... GIVELIVELY_CAMPAIGNS="AAFE Gala 2027" \
     RESEND_API_KEY=... EMAIL_FROM="AAFE Gala <gala@your-verified-domain>" \
     GUEST_PORTAL_URL=https://<guest-portal-host>/ CRON_SECRET=<long random string>
   npx supabase functions deploy givelively-sync
   npx supabase functions deploy send-emails
   ```
4. **Schedules.** Fill in the two values at the top of `database/cron.sql` and run it.
5. **Check.** `select * from givelively_sync_state;` shows the last poll. `select * from email_log where status = 'queued' and approved_at is null;` shows drafts waiting for staff approval.

**Every email needs staff approval** (team hard rule 4). Give Lively purchases, pledges and recorded payments create a *draft* guest-list email, and staff approve it (`staff_approve_email`) or discard it (`staff_cancel_email`). A staff member sending their own email ("send new link", QR invite) counts as the approver, and both are logged. Sponsor links expire at the end of the order's guest-list deadline day (New York time).

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
     GIVELIVELY_ORG_ID=demo-aafe GIVELIVELY_API_KEY=<any made-up string> GIVELIVELY_CAMPAIGNS="AAFE Gala 2027" \
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
- **Only gala sales.** The endpoint returns *all* of AAFE's donations. Only donations whose campaign name contains one of `GIVELIVELY_CAMPAIGNS` are imported. Others are ignored.
- **Field names are not documented by Give Lively.** The mapping in `_shared/givelively.ts` follows the "Line Items (All)" report names and tolerates snake_case, nesting and amounts in cents. **Before launch, run one poll against AAFE's account and check `select * from givelively_raw where import_status = 'unmapped';`.** Any row there means a field name needs adding to `FIELDS`.
- **Rules.**
  - No duplicates: a donation is matched on its Give Lively transaction ID.
  - Refunds update the existing payment and flag it for review.
  - Pending or failed bank payments are skipped until Give Lively reports them settled.
  - Give Lively's own fee is stored as reported and never recomputed.
- **Flagged for review** (`payments.reconciliation_status = 'needs_review'`, reason in `orders.internal_notes`):
  - the package name didn't match a tier (it is set to Community Ticket)
  - the payment method wasn't recognized
  - the fee was missing
- **Ticket quantity.** A ticket purchase gets one seat per ticket. The count comes from Give Lively's quantity field if present, otherwise from amount ÷ ticket price.
- **Backup path.** CSV upload of "Line Items (All)" from the Integrations page calls `staff_import_givelively(rows)`. It uses the same rules and is admin only.

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
| `sendQrInvite` | `staff_send_qr_invite(p_guest_id)`; approved by the sender. The guest needs a seat and an email; the code is minted when it sends | admin, RM |
| `resendPortalLink` | `staff_resend_portal_link(p_order_id)`; approved by the sender; the old link stops working | admin, RM |
| `checkIn` | `staff_check_in(p_guest_id, 'search')` or `staff_check_in_qr(p_code)` | all |
| `checkInException` | `staff_check_in_exception(p_name, p_order_id, p_type, p_note)` | all |
| `importGiveLively` (CSV) | `staff_import_givelively(p_rows)` | admin |
| Integrations "Pull now" | `functions.invoke('givelively-sync')` | admin |
| Approve / discard a draft email | `staff_approve_email(p_email_id)` / `staff_cancel_email(p_email_id)` | admin, RM |
| Send approved email now | `functions.invoke('send-emails')` | admin, RM |

Errors come back as the Postgres message: `forbidden`, `not_found`, `invalid_link`, `invalid_input: …`, `invalid_transition: …`, `seat_taken`, `seat_locked: …`.

## Changes to the schema (all in `backend.sql`)

- New tables: `givelively_sync_state` (poll cursor and last result) and `givelively_raw` (every gala donation as Give Lively sent it).
- New `email_log` columns: `attempts`, `last_error`, `approved_by` and `approved_at`. New status: `cancelled`.
- New unique index on `payments.givelively_transaction_id`.
- `orders.portal_token` now holds a hash. The seed's demo links (`ac-6w9k3p5d`, etc.) still work.
- The `audit_log` and `salesforce_sync` id counters are moved past the seed's ids (fixes a duplicate-key error on the first new audit row).

## Not done yet

- **Guest Portal is connected** when `guest-portal/.env.local` is set, and runs offline on the synthetic data when it isn't (the `OPEN-*.html` files). The landing page's demo cards still come from the built-in data. Their links work against the backend only if `seed.sql` was loaded.
- **Staff App still uses in-memory data.** To connect it:
  - Swap `staff-app/src/store.ts` and `Login.tsx` to the calls above.
  - Sponsors → "copy portal link" becomes "send new link", because tokens are stored hashed.
- **QR e-tickets (hard rule 6).** A code is minted only when an approved `qr_invitation` email sends; the database keeps its SHA-256 hash on the guest's seat (`seats.qr_token_hash`), valid until 6 a.m. New York time the morning after gala night. Resending replaces the code; a different guest on the seat, a name or email change, or a cancelled seat voids it. Staff can't display a code, only resend it. The seed's QR codes are moved onto seats as hashes when `backend.sql` runs. The seed's demo sponsor links are short (8 characters), fine for the demo but below rule 6's 128 bits; real links are minted at 128 bits by `send-emails`.
- **Email.** Only `portal_link` and `qr_invitation` templates are built, in English (the portal page itself has 中文 and Español). Scheduled deadline reminders and payment receipts aren't built.
- **Salesforce.** Not built (out of scope in the project scope doc).
- **Edge functions** haven't been run yet. Deno wasn't available when they were written, so test them after the first deploy. The SQL and the Give Lively mapping are tested.
