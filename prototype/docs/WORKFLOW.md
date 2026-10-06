# AAFE Gala Apps — How the Two Apps Work Together

Capstone prototype by ERIMX BOKHUS (Pursuit AI Builder Fellowship). **All data is synthetic.** The sponsorship tiers and seat counts come from AAFE's public 2025 sponsorship flyer. AAFE must confirm the packages for future years.

There are **two apps** and **one database**:

| App | Who uses it | How they get in | What it does |
|---|---|---|---|
| **Guest Portal** (`guest-portal/`) | Sponsors and ticket buyers | A private link in an email sent after they pay or pledge | Add or update attendee names, titles, organizations, dietary and accessibility needs. See amount paid, payment dates, balance and a timestamped activity history. **Payment details are never shown.** |
| **Staff App** (`staff-app/`), the "client app" | AAFE gala team, relationship managers, check-in volunteers | Staff login with roles | Dashboard, gala information, sponsors and orders, spreadsheet-style guest list, **payments and Give Lively fees per ticket with totals**, seating chart (table and seat), relationship guests with QR codes, badge template and print sheet, iPad check-in, Give Lively and Salesforce integrations, email log, audit log |

```
              ┌────────────────┐        ┌──────────────────────────┐
 Donor pays → │  Give Lively   │──poll──▶│                          │──push──▶ Salesforce (NPSP)
              └────────────────┘        │   BACKEND (Supabase)      │          historical ledger
 Check / ACH → staff records it ───────▶│  Postgres + Auth + RLS    │
                                        │  Edge functions + cron    │──email─▶ Guest (portal link / QR)
                                        └───────▲──────────▲───────┘
                                                │          │
                                   token RPC    │          │  authenticated (role-based)
                                    ┌───────────┴──┐   ┌───┴────────────┐
                                    │ Guest Portal │   │   Staff App    │
                                    └──────────────┘   └────────────────┘
```

The two apps never talk to each other directly. Both read and write the **same database**. When a guest saves a name in the portal, it shows up immediately in the staff app's guest list, dashboard feed and badge queue. When staff confirm a name, seat a guest, or record a payment, the guest sees it in the portal.

> In this prototype each app holds its own in-memory copy of `shared/src/seed.json`, so a change in one does not appear in the other. Live sync begins when the backend team connects both apps to Supabase. The functions to swap are listed under "Front-end needs" below.

---

## 1. End-to-end workflow

### A. Purchase or pledge comes in

| Path | What happens | Who acts |
|---|---|---|
| **Give Lively, card or bank (ACH)** | 1. Backend job polls Give Lively every 10–15 minutes. 2. Creates sponsor, order, payment and empty seats from the package. 3. Generates a private portal token. 4. **Emails the portal link automatically.** | Automatic |
| **Check in the mail** | 1. Relationship manager records a **pledge** in the staff app (Sponsors → New pledge). 2. Seats and the token are created, and the **portal link is emailed right away**, so guests can be named before the check arrives. 3. When the check arrives, staff record it (Payments → Record check/ACH) with the check number and deposit date. | Staff |
| **ACH or wire straight to AAFE's bank (not through Give Lively)** | Same as a check: record the pledge, then record the payment when it shows on the bank statement. These payments have no processor fee. Later, a bank-feed integration (e.g. Plaid) could match deposits automatically. That is out of scope for the MVP. | Staff |
| **Relationship / comp guests** (the Executive Director's or board's guests) | 1. Staff add the guest (Relationship guests → Add). 2. Staff send the QR invitation email. 3. The QR code is created as the email sends; only its hash is stored, on the guest's seat. 4. The guest shows the QR at the door. | Staff |

> Note: ACH paid **through Give Lively** arrives with the rest of the Give Lively data automatically. It runs on Stripe and costs 0.8%, capped at $5 ([Give Lively fees](https://www.givelively.org/fees-and-disbursement); [Give Lively ACH via Stripe Financial Connections](https://www.givelively.org/resources/learn-about-ach-bank-payments-via-stripe-financial-connections)). Only ACH or wires sent **directly to AAFE's bank** need staff entry. Checks always need staff entry.

### B. Guest names their seats (Guest Portal)
1. The guest opens the emailed link, `https://<portal>/#/s/<token>`. No password is needed; the link is the key.
2. They see the organization, package, amount paid, payment date(s), balance, deadline, venue and seats. They do not see the payment method, card or bank details, fees or internal notes.
3. They add or edit name, title, organization, email, dietary needs and accessibility needs.
4. Every save writes an `audit_log` row with a timestamp. The guest sees it under "Your activity".

### C. Staff prepare the event (Staff App)
1. **Guest list.** Review portal submissions (`submitted → reviewed`) and fix spelling inline in the spreadsheet view.
2. **Seating chart.** Assign each guest a table and seat, either by tapping a guest and then a seat, or by seating a whole sponsor group at once.
3. **Badges.** A seat moves to `reviewed → badge_ready` once it has a table and seat. Print the sheet or export a CSV for the printer, then mark the badges printed. If anyone later edits the name, title, organization or seat, the badge flips to **reprint needed**.
4. **Payments and fees.** Each row shows Original, Donor-covered fee, Gross, **Give Lively (processor) fee** and Net, with totals and a by-method breakdown.
5. **Salesforce.** Push new sponsors, payments and attendance to Salesforce for the year-over-year history.

### D. Event day (iPad)
- Volunteers log in with the **check-in volunteer** role and see only the check-in screen.
- Search by name, organization or sponsor, or scan a QR code (camera where supported, typed code otherwise). Tap **Mark arrived**.
- Exceptions (unnamed sponsor seat, walk-in, comp, etc.) are saved with a type and note.
- Arrivals update the dashboard count.

### Seat state machine
```
unnamed ──guest adds name──▶ submitted ──staff review──▶ reviewed ──table+seat──▶ badge_ready ──door──▶ checked_in
   ▲                             ▲   │                                                │
   └──guest/staff removes────────┘   └──guest edits again (badge → reprint_needed if printed)◀┘
```
Badge status runs separately: `needs_review → ready → printed → reprint_needed`.

---

## 2. Give Lively fees: what the staff app shows

- Give Lively charges **no platform fee**. All fees are third-party processor fees, mostly Stripe ([Give Lively fees and disbursement](https://www.givelively.org/fees-and-disbursement)). Nonprofit rates: cards 2.2% + $0.30, Amex 3.5%, bank/ACH 0.8% capped at $5, PayPal 1.99% + $0.49. Check disbursement costs $1.01 per check.
- Donors can choose to **cover the fee**, including on Event Ticketing pages for card and ACH ([Give Lively: donors covering fees](https://www.givelively.org/resources/understand-how-donors-can-cover-third-party-transaction-fees)).
- Give Lively's **"Line Items (All)"** report includes Original Amount, Covered Transaction Fee Amount, Gross Amount, Transaction Fee Amount, Fractional Disbursement Fee, Total Refunded Amount and Net Amount ([Give Lively donor data](https://www.givelively.org/resources/explore-the-donor-data-available-for-member-nonprofits); [downloading donor data](https://www.givelively.org/resources/download-donor-data-from-nonprofit-admin-portal)).
- **In production, store Give Lively's own `Transaction Fee Amount`. Do not recompute it.** The prototype's formula is only for generating synthetic data.
- The staff app totals: **Total Give Lively fees**, **donor-covered fees**, **fees AAFE absorbed** (total fees − donor-covered) and **net to AAFE**.

---

## 3. What the BACKEND needs (Cornell, Aisling)

Recommended stack: **Supabase**. It provides Postgres, Auth, Row-Level Security, Edge Functions, scheduled jobs (pg_cron) and Storage. Hosting is AAFE and GreyBox's decision after handoff; this is only a build recommendation.

| # | Piece | Details |
|---|---|---|
| 1 | **Database** | Run `database/schema.sql`, then `database/seed.sql`. There are 13 tables plus 2 views (`v_payment_ledger`, `v_fee_totals`). Tested by loading into Postgres (PGlite) with no errors. |
| 2 | **Staff auth** | Supabase Auth with email and password or magic link, and MFA for admins. The role (`gala_admin`, `relationship_manager`, `check_in_volunteer`) lives in `staff_users` and is linked to `auth.users`. |
| 3 | **RLS policies** | Admin: full access. Relationship manager: read everything; write guests and their own orders. Volunteer: read the guest fields needed for check-in; insert `check_ins` only. See the bottom of `schema.sql`. |
| 4 | **Guest portal RPCs** | `get_portal_view(token)`, `save_portal_guest(token, slot, …)`, `release_portal_seat(token, slot)`. These are SECURITY DEFINER functions that validate a **hashed, expiring, revocable token** and return only guest-safe fields. The portal never queries tables directly. |
| 5 | **Give Lively poller** | A cron edge function runs every 10–15 minutes. It calls the Zapier JSON endpoint `https://secure.givelively.org/nonprofits/[ORG_ID]/json_dataclips/[API_KEY].json?start_time_ms=<last>` ([Give Lively: Zapier JSON endpoints](https://www.givelively.org/resources/understand-zapiers-json-endpoints)), then upserts sponsors, orders and payments. It is **idempotent on the Give Lively transaction ID**, creates seats, and queues the portal-link email. A CSV import of "Line Items (All)" is the fallback (already in the staff app). |
| 6 | **Email service** | Use Resend, Postmark or SendGrid, sending from an AAFE domain. Templates: `portal_link`, `qr_invitation`, `guest_list_reminder`, `payment_receipt`. Each send is logged in `email_log`. Scheduled reminders go out N days before `guest_list_deadline` to orders with unnamed seats. |
| 7 | **Audit trigger** | A Postgres trigger on `guests`, `seats`, `orders` and `payments` writes `audit_log` (who, when, from → to). This is the "every change records date and time" requirement. |
| 8 | **Salesforce sync** | A queue in `salesforce_sync`, processed by a job that upserts Account, Contact, Opportunity, Payment and CampaignMember through the Salesforce REST API (OAuth connected app). See section 5. |
| 9 | **QR tokens** | Random and unguessable (128-bit), one per seat, stored only as a hash (`seats.qr_token_hash`), expiring the morning after gala night. The door scan hashes the code and looks up the seat. Never encode personal info in the QR. |
| 10 | **Backups and retention** | Daily backups. AAFE approves how long guest data is kept after the gala. |

## 4. What the FRONT END needs (Natalie, Antonin)

Both apps are built with Vite, React, TypeScript and Tailwind. They share code in `shared/src` (types, theme, UI, the A−/A+ text size and light/dark controls) and the photos in `shared/public`.

| Task | Where |
|---|---|
| Replace in-memory `loadDB()` with a Supabase client | `shared/src/data.ts` |
| Guest portal: swap the 3 functions for the RPCs above | `guest-portal/src/portalApi.ts` |
| Staff app: each action in `store.ts` becomes an insert/update. The function names stay the same. | `staff-app/src/store.ts` |
| Real-time updates: subscribe to `guests`, `seats`, `payments` and `audit_log` changes | Staff dashboard and guest list |
| Staff login → Supabase Auth | `staff-app/src/pages/Login.tsx` |
| Set `VITE_GUEST_PORTAL_URL` so staff can copy or resend correct links | `staff-app` build env |
| Have AAFE review the translations (English / 中文 / Español) | `guest-portal/src/i18n.ts` |
| Have AAFE approve the photos and get permission for the people shown | `shared/public/photos` |

---

## 5. Salesforce: should you sign up?

**Yes. Sign up for a free Developer Edition for the team now. AAFE uses its own org for production.**

1. **Team (now, free):** Create a Salesforce Developer Edition org at [developer.salesforce.com/free-trials](https://developer.salesforce.com/free-trials) and install the **Nonprofit Success Pack (NPSP)**. Build and test the sync against it using only synthetic data.
2. **AAFE (production):** Through the Power of Us program, eligible nonprofits get **10 donated Salesforce licenses** ([Salesforce Help: Power of Us](https://help.salesforce.com/s/articleView?id=000366523&type=2&language=en_US)). That is 10, not 6. AAFE may already have Salesforce, so ask AAFE's project contact or AAFE's gala lead first.
3. **Give Lively's free Salesforce integration** is built for NPSP and syncs hourly. Give Lively recommends testing in a sandbox first ([Give Lively: Salesforce integration](https://www.givelively.org/resources/integrate-our-platform-with-salesforce); [AppExchange listing](https://appexchange.salesforce.com/appxListingDetail?listingId=a0N3A00000FABSeUAP)). If AAFE turns it on, Give Lively donations reach Salesforce on their own. **Our sync then only adds what Give Lively doesn't know:** checks, direct ACH, comps, seats, table assignments and attendance. Use Give Lively's transaction ID to avoid duplicates.

| This app | Salesforce (NPSP) |
|---|---|
| Sponsor | Account (Organization) + Contact |
| Order (per gala) | Opportunity, Campaign = "AAFE Gala 2027" |
| Payment | `npe01__OppPayment__c` |
| Guest / attendance | Contact + CampaignMember (Status = Attended) |
| Fees | Opportunity custom fields `Processor_Fee__c`, `Net_Amount__c` |

---

## 6. Open questions for AAFE (AAFE's project contact, AAFE's gala lead)

1. Which Give Lively campaign or event page will sell gala tickets in 2027, and who can create the Zapier API key?
2. Does AAFE already have Salesforce/NPSP? Is Give Lively's integration turned on?
3. Who records checks and direct ACH today, and from what document (deposit slip, bank statement)?
4. Final 2027 sponsorship packages, seat counts and benefits.
5. Badge printer and badge size (the template assumes a 4×3 in. badge).
6. Venue floor plan: number of tables and seats per table (the prototype uses 11 tables of 10).
7. How long guest data should be kept after the gala.
