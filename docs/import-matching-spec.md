# Give Lively import and matching spec

Status: **revised Oct 5, 2026** for AAFE's real Give Lively ticket export (`docs/aafe-materials-2026-10-05.md`)
and Natalie's Supabase backend (`natalie-backend` branch: `prototype/database/schema.sql`, `backend.sql`).
Replaces the Oct 3 draft, which assumed one row per ticket and a transaction ID; the real export has neither.

Applies hard rules 1, 4, 5, 6, and 7 in `CLAUDE.md`. All examples and test data are invented.

## 0. Where the import lives

The import builds on Natalie's backend instead of a separate set of tables. Both entry points already
normalize rows and call one database function, `gl_import(p_rows jsonb, p_actor text)`:

- **CSV upload** from the staff app (`staff_import_givelively`), admin only. **This is the path for the
  real ticket export and for the demo.**
- **Automatic sync** from Give Lively's Zapier JSON feed (`givelively-sync` edge function). Stretch goal;
  unchanged by this spec except where noted.

The parsing and matching rules (sections 2–5) live in one TypeScript module with no UI or database code,
so they can be unit-tested (section 11). `gl_import()` stays the single place that writes to the database.

### What changes in Natalie's current `gl_import()`

| # | Today | Change | Why |
| --- | --- | --- | --- |
| 1 | Skips any row without a transaction ID | CSV rows get a **purchase key** instead (section 2) | The real export has no transaction ID; every row would be skipped |
| 2 | Never reads guest names | Parse the free-text guest list into guests (section 3) | Eval blocker: "Import attendee names from Give Lively" |
| 3 | Unknown tier → defaults to Community Ticket | Unknown tier → review; nothing created until staff map it | A wrong default gives wrong seat counts silently |
| 4 | Buyer matched to a sponsor by email only | Email **and** last name (section 4) | Shared inboxes must not merge two people |
| 5 | Rows missing from a later export go unnoticed | Flag them for review on CSV uploads (section 5) | Eval blocker: "Flag rows absent from later imports" |
| 6 | Seats = tier seat count × quantity | Use the export's **Total Seats** column; fall back to tier × quantity | The export states it directly |

Kept as they are: idempotent re-import, refunds updating payments, fees stored as reported, portal-link
email queued as a **draft** for staff approval (hard rule 4), hashed portal tokens (hard rule 6).

## 1. Input: Give Lively ticket export

One row **per purchase**. Columns are matched by header name (case and spacing ignored), so column order
doesn't matter.

| Export column | Normalized field | Required | Notes |
| --- | --- | --- | --- |
| First Name, Last Name | `first`, `last` | yes | The buyer |
| Email | `email` | yes | The buyer |
| Tier Purchased | `ticket_level` | yes | Mapped to a sponsorship tier (section 3) |
| Tier Category | `tier_category` | no | Ticket vs sponsorship, as Give Lively labels it |
| Tickets Purchased | `quantity` | no | |
| Total Seats | `seats` | no | Preferred seat count |
| Amount Spent | `gross` | yes | `$1,000.00` → 1000.00 |
| Amount Refunded | `refunded` | no | |
| Transaction Fee Covered | `covered` | no | Donor-covered fee |
| Date/Time of Purchase | `date` | yes | `2026-02-05 05:14:46 PM EST`; time zone kept |
| Payment Method | `method` | no | e.g. "Stripe Card" |
| Status | `status` | no | e.g. "succeeded"; refunds and failures read from here |
| Page Name / Internal Name | `campaign` | no | Which gala page the purchase came from |
| Company/Organization Name | `company` | no | |
| Phone Number | — | — | **Not imported.** Phones aren't needed for the guest list |
| Please list the name(s) and email address(es) of all guests… | `guest_text` | no | Free text; section 3 |
| Address columns, Referrer URL, UTM Source, Client Application Name, Double the Donation | — | — | Not imported; kept in the raw row |

Fully blank rows (the sample export ends with two) are ignored, not reported.

## 2. Pipeline

One upload is one database transaction: if anything fails, nothing is applied and the run is recorded as
failed with the error.

1. **Record the run** in `import_runs`: who, when, file name, file hash.
2. **Parse and validate** each row. Missing required field, unreadable amount or date → **rejected**,
   listed with its row number and reason. Rejected rows aren't review items; the fix is a corrected file.
3. **Purchase key.** CSV rows have no transaction ID, so each purchase is keyed on
   `csv:` + SHA-256 of (lower-cased email | purchase date/time as exported | tier purchased).
   The key goes where Natalie's code expects `txn`, so `givelively_raw` and the unique payment index keep
   working unchanged. A second row with the same key in one file is rejected as a duplicate.
   *Limit:* a purchase seen first through the JSON sync and later through CSV gets a different key, so one
   gala uses one source. The demo uses CSV.
4. **Unchanged rows skip.** A key already imported with the same raw row changes nothing.
5. **Create or update** the order, payment, seats, and guests (sections 3–5).
6. **Detect** rows missing since the last full CSV upload (section 5).
7. **Report** (section 8).

Re-importing the same file changes nothing and reports every row as unchanged.

## 3. Rows to orders, seats, and guests (Natalie's schema)

- **Order and payment.** One `orders` row per purchase key, `source = givelively`, plus one `payments`
  row. Status `paid`, or `partially_paid` if refunds bring it below the commitment.
- **Tier.** Matched from Tier Purchased against `sponsorship_tiers` (Natalie's longest-name match).
  No match → review `unknown_tier`; nothing is created for that row until staff map the tier and re-run.
- **Seats.** `Total Seats` seats (fallback: tier seat count × tickets purchased). Advertising-only tiers
  get none.
- **Seated or admitted.** Champion and above guarantee a table; Friend, Supporter, and single tickets are
  admitted without one (AAFE's 2026 flyer). Proposed: a `guaranteed_seating` flag on
  `sponsorship_tiers`, so the guest list and badges can show it.
- **Guests from the free-text list.** Each parsed guest becomes a `guests` row on the order
  (`last_updated_by = givelively_sync`, `guest_type` from the tier) and fills the next seat, which moves
  to `submitted`, so staff review it like a portal entry. Remaining seats stay `unnamed`.
- **Portal link.** If seats are still unnamed, a portal-link email is queued as a **draft** (Natalie's
  `enqueue_email`); staff approve before anything sends.

### Splitting the free-text guest list

The column answers "Please list the name(s) and email address(es) of all guests. To revise, email
gala@aafe.org." Buyers type it however they like. Plain rules first, in this order:

1. **Nothing to name:** empty, or only "TBD", "TBA", "to follow", "N/A", "none" → all seats stay unnamed.
   No review.
2. **Split into entries** on line breaks, semicolons, and list markers (`1.`, `2)`, `-`, `•`). One line
   holding two or more email addresses is also split around each address.
3. **Read each entry:** an email address if present (lower-cased); the rest, minus separators such as
   `-`, `:`, `,`, `<>` and `()`, is the name. A name of two or more words → first name = first word,
   last name = the rest. One word → review.
4. **The buyer themself:** "me", "myself", "self", or the buyer's own name → the buyer is seated, with
   their email.
5. **Send to review (`guest_text_unclear`)**, showing the original text: an entry with an email but no
   name, a one-word name, an entry that can't be read, or **more names than seats** (the extra names are
   held, never dropped).

Revisions arrive later by email to gala@aafe.org; staff enter them in the staff app or the sponsor uses
the portal link. Either way they override the import (section 6).

**AI option (only if the team decides AI features are required; see the hub's Data and AI page).** When a
list fails the plain rules, staff can ask AI to propose a split. Emails and phone numbers are stripped
before the text is sent (hard rule 5); the proposal appears in the review item for staff to accept or
edit. Off by default.

## 4. Matching

**Normalization** (every rule): Unicode NFKC, case-folded, trimmed, inner spaces collapsed, punctuation
removed. Names drop honorifics and suffixes (Dr, Mr, Ms, Mrs, Hon, Rev, Jr, Sr, II, III). Organizations
drop legal suffixes (Inc, LLC, LLP, Corp, Co, Ltd), a leading "The", and treat `&` as "and". Emails are
trimmed and lower-cased only.

**Buyer → sponsor** (`sponsors`), first rule that answers:

1. Same email **and** same last name → that sponsor.
2. Same email, different last name → review `email_name_conflict` (a shared inbox); a new sponsor is
   created meanwhile so the order isn't lost.
3. Otherwise → new sponsor. The organization is the Company column, else the buyer's name.

**Guest → existing guests of this gala** (to catch one person on two orders), first rule that answers:

1. Same email and same last name, on a different order → review `double_booked`.
2. Same full name and same organization, on a different order → review `double_booked`.
3. Same name tokens in another order ("Chen Wei" / "Wei Chen"), or same first initial and last name, same
   organization → review `possible_duplicate`.

A guest whose email equals the buyer's email (a coordinator listing colleagues with their own inbox)
doesn't get that email stored. Nicknames and typos aren't detected; staff merge those by hand. Natalie's
schema keeps guests per order and has no cross-year contacts table, so matching across galas is out of
MVP scope.

## 5. Refunds, changes, and missing rows

- **Refund.** Amount Refunded changes → payment updated (Natalie's code already does this). Refunded in
  full, or Status shows refunded or failed → order `cancelled`, its seats `cancelled`, and review
  `refund` so the relationship owner can follow up. Nothing is deleted; badges and check-in skip cancelled
  seats.
- **Amount change** on an imported purchase → payment updated, listed in the report.
- **Guest list text changed** on re-import → nothing is overwritten; review `guest_text_changed` shows the
  old and new text so staff decide.
- **Missing from a later export.** CSV uploads are full snapshots, so a purchase key in the last upload
  and absent now → review `missing_from_source`. Nothing is cancelled automatically: a filtered or
  partial export must not wipe guests. (The JSON sync is incremental, so this check doesn't apply to it.)

## 6. Staff and sponsor corrections survive re-import

The import creates guests **once**, from the first upload that names them. After that it never edits a
guest: staff edits in the staff app and sponsor edits in the portal are authoritative, and every edit is
in `audit_log`. A later change to the free-text list in Give Lively raises `guest_text_changed` instead of
overwriting (section 5). The original text stays in `givelively_raw`.

This is simpler than the field-by-field override layer in the Oct 3 draft and covers the real export,
where the only guest data is the free-text list.

## 7. Review queue

Proposed table `import_review` (id, import run, purchase key, reason, details jsonb with the original text
and any candidate, status open/resolved, resolved by, resolved at). A resolved item doesn't come back for
the same row and the same data.

| Reason | Raised when | Staff choose |
| --- | --- | --- |
| `unknown_tier` | Tier Purchased matches no tier | Map it to a tier, then re-run that row |
| `guest_text_unclear` | The guest list can't be fully read (section 3) | Enter the names · Leave seats unnamed |
| `guest_text_changed` | The guest list differs from the last upload | Apply the new names · Keep current guests |
| `email_name_conflict` | Same buyer email, different last name | Same person (merge sponsors) · Different person |
| `double_booked` | A guest is already on another order | Keep on this order · Keep on the other · Keep both |
| `possible_duplicate` | Close but not certain name match | Same person · Different person |
| `refund` | Order refunded or failed | Acknowledge · Reinstate |
| `missing_from_source` | Purchase absent from the latest upload | Cancel the order · Keep it (partial export) |

## 8. Import report

Shown at the end of every upload and kept with its `import_runs` row: file name and hash, who ran it,
start and finish, status; counts of rows read, new, updated, unchanged, rejected, and sent to review;
rejected rows with row number and reason; review items created; purchases missing since the last upload;
portal-link drafts waiting for approval. Staff-only; never sent to an AI service.

## 9. Proposed changes to Natalie's backend

For Natalie to review; nothing here changes her branch until she agrees.

1. CSV normalizer for the real export (section 1), producing the purchase key as `txn`.
2. Guest-list splitter (section 3) and matching (section 4) as a tested TypeScript module the CSV path
   calls before `gl_import()`.
3. `gl_import()` accepts parsed guests per row, creates `guests` and fills seats; unknown tier → review
   instead of defaulting.
4. New tables `import_runs` and `import_review`; a `guaranteed_seating` flag on `sponsorship_tiers`.
5. Missing-row check on CSV uploads.

## 10. Open questions for AAFE

- Do purchases of sponsorship tiers on Give Lively appear in this same export? (The Tier Category column
  suggests yes.)
- A few more redacted rows with real-world guest lists, to test the splitter on how buyers actually type.
- Is the guest-list question worded the same every year? The header is matched by its start ("Please list
  the name") to tolerate small changes.

## 11. Test cases

Unit tests of the parsing and matching module, plus database tests of `gl_import()` against invented seed
data (`docs/seed-data-requirements.md`, `seed/natalie-prototype/`).

| # | Case | Given | Import | Expected |
| --- | --- | --- | --- | --- |
| 1 | Ticket, buyer attends | Empty gala | 1 ticket, guest text "me" | 1 order, 1 seat, buyer seated |
| 2 | Coordinator buys for colleagues | Empty gala | 2 tickets, text lists 2 names with the buyer's email | 2 guests, no email stored on them, buyer not seated |
| 3 | Same file twice | Case 1 imported | Same file | Nothing new; all rows unchanged |
| 4 | Duplicate purchase in one file | — | Two identical rows | One order; second row rejected as duplicate |
| 5 | Blank rows | — | Export with trailing blank rows | Ignored, not reported |
| 6 | Names on separate lines | — | "Jane Doe jane@example.org⏎Sam Lee sam@example.org" | 2 guests with emails |
| 7 | Numbered list | — | "1. Jane Doe 2. Sam Lee" | 2 guests |
| 8 | Two emails on one line | — | "Jane Doe jane@example.org, Sam Lee sam@example.org" | 2 guests |
| 9 | Nothing yet | — | "TBD" | All seats unnamed; no review; portal draft queued |
| 10 | One-word name | — | "Jane" | Review `guest_text_unclear` |
| 11 | More names than seats | 2-seat purchase | 3 names | 2 seated; review holds the third |
| 12 | Sponsorship, partial names | — | Champion, 6 seats, 3 names | 6 seats, 3 submitted, 3 unnamed; portal draft queued, not sent |
| 13 | Unknown tier | No tier "VIP Table 2027" | Row with that tier | Review `unknown_tier`; nothing created |
| 14 | Shared inbox | Sponsor "Ana Ruiz", `events@example.com` | Buyer "Mark Lee", same email | Review `email_name_conflict`; new sponsor created |
| 15 | Same buyer, case and spaces | Sponsor `grace.kim@example.org`, Kim | Buyer ` Grace.Kim@Example.org `, Kim | Same sponsor |
| 16 | Guest on two orders | "Susan Cho" on sponsor A's order | Sponsor B lists "Susan Cho" | Review `double_booked` |
| 17 | Name order swap | "Wei Chen", Harbor Health | "Chen Wei", Harbor Health | Review `possible_duplicate` |
| 18 | Full refund | Case 1 imported | Same purchase, fully refunded | Order and seat cancelled; review `refund` |
| 19 | Partial refund | $500 purchase | $250 refunded | Payment updated; order partially paid; in report |
| 20 | Guest text changed | Case 6 imported | Same purchase, a name changed | Guests unchanged; review `guest_text_changed` |
| 21 | Staff edit survives | Staff corrected a title | Same file re-imported | Title stays as staff set it |
| 22 | Purchase disappears | Two purchases imported | Next upload has one | Review `missing_from_source`; nothing cancelled |
| 23 | Missing required field | — | Row with no email | Rejected with row number; rest imports |
| 24 | Failed import rolls back | Any | File that fails partway | Nothing applied; run marked failed |
| 25 | Phone never imported | — | Row with a phone number | No phone stored anywhere from the import |
