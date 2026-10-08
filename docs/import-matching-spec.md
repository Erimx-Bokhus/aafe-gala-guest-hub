# Give Lively import and matching spec

Status: **revised Oct 5, 2026** for AAFE's real Give Lively ticket export (`docs/aafe-materials-2026-10-05.md`)
and Natalie's Supabase backend (`natalie-backend` branch: `prototype/database/schema.sql`, `backend.sql`),
then updated the same day with Natalie's review: sponsors confirm imported names, names print exactly as
typed, a sturdier purchase key, date-range-aware missing checks, and four parsing gaps. Updated Oct 6
from Natalie's second review of the real export: a staff-maintained tier mapping (the export's tier is
just "Ticket") and a gala page filter that matches AAFE's real page name. Three rules settled Oct 6
while building the engine (`docs/decisions.md`): partly clear guest lists still pre-fill, a name-only
match is a possible duplicate, and an upload with no gala page set asks for it. **Changed Oct 7: the import
reads no guest names.** The export's free-text guest list is dropped like phone numbers, and sponsors name
every guest through their private link (`docs/decisions.md`). Sections 3–8 below say so where it matters.
Replaces the Oct 3 draft, which assumed one row per ticket and a transaction ID; the real export has neither.

Applies hard rules 1, 4, 5, 6, and 7 in `CLAUDE.md`. All examples and test data are invented.

## 0. Where the import lives

The import builds on Natalie's backend instead of a separate set of tables. Both entry points already
normalize rows and call one database function, `gl_import(p_rows jsonb, p_actor text)`:

- **CSV upload** from the staff app (`staff_import_givelively`), admin only. **This is the path for the
  real ticket export and for the demo.**
- **Automatic sync** from Give Lively's Zapier JSON feed (`givelively-sync` edge function). Stretch goal.

The parsing and matching rules (sections 2–4) live in one TypeScript module with no UI or database code,
so they can be unit-tested (section 11). `gl_import()` stays the single place that writes to the database.

### What changes in Natalie's current `gl_import()`

| # | Today | Change | Why |
| --- | --- | --- | --- |
| 1 | Skips any row without a transaction ID | Every purchase gets a **purchase key** from email + purchase moment in UTC (section 2) | The real export has no transaction ID; every row would be skipped |
| 2 | Never reads guest names | ~~Parse the free-text guest list and pre-fill the sponsor's portal~~ Unchanged since Oct 7: the guest-list column is dropped, and sponsors name every guest through their link (section 3) | Privacy: a buyer's typed list arrives without the guests' say; sponsors editing their own guests is AAFE's top priority |
| 3 | Unknown tier → defaults to Community Ticket | Tier resolved through a **staff-maintained tier mapping**; still unknown → staff review, nothing created until mapped (section 3) | A wrong default gives wrong seat counts silently; the real export's tier is just "Ticket" |
| 4 | Buyer matched to a sponsor by email only | Email **and** last name (section 4) | Shared inboxes must not merge two people |
| 5 | Rows missing from a later export go unnoticed | Flag them, within the uploaded file's date range (section 5) | Eval blocker: "Flag rows absent from later imports" |
| 6 | Seats = tier seat count × quantity | Use the export's **Total Seats** column; fall back to tier × quantity | The export states it directly |
| 7 | JSON sync keeps campaigns whose name contains `GIVELIVELY_CAMPAIGNS` (`"AAFE Gala 2027"`) | Match the gala's **Give Lively page name**, stored per gala (section 3) | The real page is "AAFE's 52nd Annual Gala"; with today's setting every real purchase is ignored |

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
| Date/Time of Purchase | `date` | yes | `2026-02-05 05:14:46 PM EST`; converted to UTC |
| Payment Method | `method` | no | e.g. "Stripe Card" |
| Status | `status` | no | e.g. "succeeded"; refunds and failures read from here |
| Page Name / Internal Name | `campaign` | no | Which gala page the purchase came from |
| Company/Organization Name | `company` | no | |
| Phone Number | — | — | **Not imported.** Phones aren't needed for the guest list |
| Please list the name(s) and email address(es) of all guests… | — | — | **Not imported** (Oct 7). Recognized by its start ("Please list the name") only to be dropped; section 3 |
| Address columns, Referrer URL, UTM Source, Client Application Name, Double the Donation | — | — | Not imported; kept in the raw row |

Fully blank rows (the sample export ends with two) are ignored, not reported.

## 2. Pipeline and purchase key

One upload is one database transaction: if anything fails, nothing is applied and the run is recorded as
failed with the error.

1. **Record the run** in `import_runs`: who, when, file name, file hash, and the earliest and latest
   purchase time in the file.
2. **Parse and validate** each row. Missing required field, unreadable amount or date → **rejected**,
   listed with its row number and reason. Rejected rows aren't review items; the fix is a corrected file.
3. **Purchase key** = SHA-256 of (lower-cased, trimmed buyer email | purchase moment converted to UTC,
   to the second). The tier is deliberately left out, so a tier renamed mid-campaign doesn't turn past
   purchases into new ones. One buyer making two purchases in the same second doesn't happen; a second
   row with the same key in one file is rejected as a duplicate.
   - `gl_import()` dedupes on this key (a `purchase_key` column on `payments`, unique), not on the
     transaction ID.
   - **Both entry points compute the same key** from the same two fields, so the CSV upload and the JSON
     sync recognize each other's purchases. When a transaction ID exists (JSON sync, or the optional
     "Line Items (All)" report in section 10), it's stored alongside the key.
4. **Unchanged rows skip.** A key already imported with the same raw row changes nothing.
5. **Create or update** the order, payment, seats, and imported guest names (sections 3–5).
6. **Detect** purchases missing since the last upload, within this file's date range (section 5).
7. **Report** (section 8).

Re-importing the same file changes nothing and reports every row as unchanged.

## 3. Rows to orders, seats, and guests (Natalie's schema)

- **Order and payment.** One `orders` row per purchase key, `source = givelively`, plus one `payments`
  row. Status `paid`, or `partially_paid` if refunds bring it below the commitment.
- **Tier.** Resolved in this order (details below): the gala's tier mapping, then Natalie's longest-name
  match against `sponsorship_tiers`. No match → staff review `unknown_tier`; nothing is created for that
  row until staff map the tier and re-run.
- **Seats.** `Total Seats` seats (fallback: tier seat count × tickets purchased). Advertising-only tiers
  get none.
- **Seated or admitted.** Champion and above guarantee a table; Friend, Supporter, and single tickets are
  admitted without one (AAFE's 2026 flyer). Proposed: a `guaranteed_seating` flag on `sponsorship_tiers`,
  so the guest list and badges can show it.

### Tier mapping

AAFE's real export says only `Ticket` in both Tier Purchased and Tier Category, and no app tier is called
that. Without a mapping, every ordinary ticket purchase would land in staff review.

Proposed table `tier_mappings` (id, event, Give Lively tier name, tier, created by, created at), unique on
event + normalized Give Lively name (NFKC, case-folded, trimmed, inner spaces collapsed):

1. Staff fill it in **once per gala**, before the first upload, from a short list of the tier names seen in
   the file. The import report lists any tier name with no mapping.
2. The import looks up Tier Purchased in the mapping first, then falls back to the longest-name match.
3. Resolving an `unknown_tier` review item saves a mapping, so every row with that name resolves on the
   re-run and on later uploads; staff don't map the same name twice.
4. Changing a mapping doesn't rewrite orders already imported; the change is logged and those orders keep
   their tier until staff change them (hard rule 7).

One Give Lively name maps to one tier. If AAFE sells more than one ticket type under the same name (for
example, Friend and Supporter both as "Ticket"), the mapping can't tell them apart; see section 10.

### Gala page

Each gala stores its Give Lively page name (proposed `gala_events.givelively_page_name`, e.g. "AAFE's
52nd Annual Gala"), set by staff for each year.

- **JSON sync:** imports only donations whose page or internal name matches it (normalized, exact),
  replacing the `GIVELIVELY_CAMPAIGNS` substring setting. Not set → the sync does nothing and says so.
- **CSV upload:** rows whose Page Name is set and differs are skipped and listed in the report with their
  row numbers, so a mixed export never puts another event's purchases on the gala list. A blank Page Name
  is imported. If the gala has no page name yet, nothing is imported: the upload lists the page names
  found in the file (with row counts), staff pick this gala's page once, and it's saved for the year.

### Guest names come from the sponsor, not the export

Decided Oct 7 (replacing the Oct 5 pre-fill): the import **reads no guest names**. The free-text guest
list in the export is recognized only to be dropped, like the phone number, so nothing a buyer typed
about other people is stored: not on the order, not in the raw row, not in the report.

1. Every imported seat starts `unnamed`.
2. The portal-link email, queued as a **draft** that staff approve (hard rule 4), asks the sponsor to name
   their guests by the deadline.
3. The sponsor names every seat through their private link (`last_updated_by = guest_portal`); staff can
   also enter names sent to gala@aafe.org. Staff still review every name before badges.

### Names print exactly as typed

Names are stored and printed **as the sponsor or staff typed them** (proposed `display_name` on `guests`, used for
badges, check-in, and the portal). Splitting into first and last name happens **only for duplicate
matching** (section 4): "Chen Wei", written family-name-first, prints as "Chen Wei", never re-ordered.
`first_name` and `last_name` (required in Natalie's schema) hold the best-effort split for sorting.

### Splitting the free-text guest list

Removed Oct 7: the guest list isn't read, so there is nothing to split (the splitter and its tests were
deleted from `import-engine/`). The rules it followed are in this file's git history.

## 4. Matching

**Normalization** (matching only, never for display): Unicode NFKC, case-folded, trimmed, inner spaces
collapsed, punctuation removed. Names drop honorifics and suffixes (Dr, Mr, Ms, Mrs, Hon, Rev, Jr, Sr,
II, III). Organizations drop legal suffixes (Inc, LLC, LLP, Corp, Co, Ltd), a leading "The", and treat
`&` as "and". Emails are trimmed and lower-cased only.

**Buyer → sponsor** (`sponsors`), first rule that answers:

1. Same email **and** same last name → that sponsor.
2. Same email, different last name → staff review `email_name_conflict` (a shared inbox); a new sponsor
   is created meanwhile so the order isn't lost.
3. Otherwise → new sponsor. The organization is the Company column, else the buyer's name.

**Imported guest → existing guests:** removed Oct 7. The import creates no guests, so there is nothing to
match; a person named by two sponsors is caught when staff review names before badges.

## 5. Refunds, changes, and missing rows

- **Refund.** Amount Refunded changes → payment updated (Natalie's code already does this). Refunded in
  full, or Status shows refunded or failed → order `cancelled`, its seats `cancelled`, and staff review
  `refund` so the relationship owner can follow up. Nothing is deleted; badges and check-in skip
  cancelled seats.
- **Amount change** on an imported purchase → payment updated, listed in the report.
- **Guest list text changed** in Give Lively → nothing happens: the list isn't read (Oct 7).
- **Missing from a later export.** A purchase from an earlier upload whose purchase time falls **inside
  this file's date range** (earliest to latest purchase in the file) but isn't in the file → staff review
  `missing_from_source`. Purchases outside the range aren't checked, so a "this month only" export
  doesn't flag everything older. Nothing is cancelled automatically. (The JSON sync is incremental, so
  this check runs on CSV uploads only.)

## 6. Staff and sponsor corrections survive re-import

The import never creates or edits a guest (Oct 7): sponsor edits in the portal and staff edits in the
staff app are the only source of names, and every edit is in `audit_log`. A re-import updates only the
purchase itself (payment, refund, cancellation).

## 7. Staff review queue

Proposed table `import_review` (id, import run, purchase key, reason, details jsonb with the original text
and any candidate, status open/resolved, resolved by, resolved at). A resolved item doesn't come back for
the same row and the same data. `guest_text_changed`, `double_booked` and `possible_duplicate` are no
longer raised (Oct 7: no guest names imported); they stay allowed so older review rows remain valid.

| Reason | Raised when | Staff choose |
| --- | --- | --- |
| `unknown_tier` | Tier Purchased has no tier mapping and matches no tier | Map it to a tier (saved as a tier mapping), then re-run |
| ~~`guest_text_changed`~~ | Not raised since Oct 7 | — |
| `email_name_conflict` | Same buyer email, different last name | Same person (merge sponsors) · Different person |
| ~~`double_booked`~~ | Not raised since Oct 7 | — |
| ~~`possible_duplicate`~~ | Not raised since Oct 7 | — |
| `refund` | Order refunded or failed | Acknowledge · Reinstate |
| `missing_from_source` | Purchase absent from an upload covering its date | Cancel the order · Keep it |

## 8. Import report

Shown at the end of every upload and kept with its `import_runs` row: file name and hash, who ran it,
start and finish, status, the file's date range; counts of rows read, new, updated, unchanged, rejected,
and staff review items; rejected rows with row number
and reason; purchases missing within the date range; portal-link drafts waiting for approval. Staff-only;
never sent to an AI service.

## 9. Proposed changes to Natalie's backend

Agreed in principle with Natalie on Oct 5; implemented by the backend pair (Aisling + Cornell), with the
portal changes by the frontend pair (Natalie + Antonin).

1. CSV normalizer for the real export (section 1) and the shared purchase-key function (section 2), used
   by both the CSV upload and the JSON sync.
2. Buyer matching (section 4) and tier resolution as a tested TypeScript module the CSV path calls before
   `gl_import()`. (The guest-list splitter and guest matching were removed Oct 7.)
3. `gl_import()`: dedupe on `payments.purchase_key`; unknown tier → review instead of defaulting; resolve
   the tier through `tier_mappings` first (section 3). Since Oct 7 it ignores any guest list or guests in
   a row and stores none.
4. Schema: `payments.purchase_key` (unique), `guests.display_name` (`orders.imported_guest_text` dropped Oct 7),
   `sponsorship_tiers.guaranteed_seating`, `gala_events.givelively_page_name`, and new tables
   `import_runs`, `import_review`, and `tier_mappings`.
5. Portal (frontend pair): email template text for the draft link email. (The "From your purchase:
   please confirm" labels are no longer needed: nothing is pre-filled.)
6. Missing-purchase check within the file's date range on CSV uploads.
7. Tier mapping screen (staff app): the tier names in the file, each with a tier picker.
8. `givelively-sync`: filter on `gala_events.givelively_page_name` instead of `GIVELIVELY_CAMPAIGNS`.

## 10. Open questions for AAFE

- **One more file, optional:** Give Lively's "Line Items (All)" report includes a real transaction ID.
  Joined to the ticket export on buyer email + purchase time, it gives each purchase a true ID.
- Do purchases of sponsorship tiers on Give Lively appear in this same export? (The Tier Category column
  suggests yes.)
- **Tier names on Give Lively:** is every ticket sold as "Ticket", or does each package have its own
  name? If two packages share a name (e.g. Friend at $2,500 and Supporter at $1,000), the mapping needs
  the amount too.
- **Page name:** is the gala page renamed each year ("AAFE's 52nd Annual Gala", then 53rd)? The page name
  is stored per gala, so either works.
- Is the guest-list question worded the same every year? The header is matched by its start ("Please list
  the name") so the column is dropped even after small changes.

## 11. Test cases

Unit tests of the parsing and matching module, plus database tests of `gl_import()` against invented seed
data (`docs/seed-data-requirements.md`, `seed/natalie-prototype/`).

Changed Oct 7: no guest names are imported. In cases 1, 2, 6–8, 10, 10b, 11, 12, 16, 16b, 17, 20, 26–28
and 32 the result is now: every seat stays unnamed, no guest is created, nothing from the typed list is
stored, and no review is raised; the tests check exactly that.

| # | Case | Given | Import | Expected |
| --- | --- | --- | --- | --- |
| 1 | Ticket, buyer attends | Empty gala | 1 ticket, guest text "me" | 1 order, 1 seat, buyer seated |
| 2 | Coordinator buys for colleagues | Empty gala | 2 tickets, text lists 2 names with the buyer's email | 2 guests pre-filled, no email stored on them, buyer not seated |
| 3 | Same file twice | Case 1 imported | Same file | Nothing new; all rows unchanged |
| 4 | Duplicate purchase in one file | — | Two identical rows | One order; second row rejected as duplicate |
| 5 | Blank rows | — | Export with trailing blank rows | Ignored, not reported |
| 6 | Names on separate lines | — | "Jane Doe jane@example.org⏎Sam Lee sam@example.org" | 2 guests pre-filled with emails, names as typed |
| 7 | Numbered list | — | "1. Jane Doe 2. Sam Lee" | 2 guests pre-filled |
| 8 | Two emails on one line | — | "Jane Doe jane@example.org, Sam Lee sam@example.org" | 2 guests pre-filled |
| 9 | Nothing yet | — | "TBD" | All seats unnamed; portal draft queued |
| 10 | One-word name | — | "Jane" | No guest created; original text shown in the portal for the sponsor; no staff review |
| 10b | Partly clear list | 3-seat purchase | "Jane Doe⏎Sam Lee⏎Bob" | Jane Doe and Sam Lee pre-filled; "Bob" shown for the sponsor; 1 seat unnamed |
| 11 | More names than seats | 2-seat purchase | 3 names | No guests created; all 3 names shown in the portal for the sponsor to choose |
| 12 | Sponsorship, partial names | — | Champion, 6 seats, 3 names | 6 seats, 3 pre-filled, 3 unnamed; portal draft "please confirm" queued, not sent |
| 13 | Unknown tier | No tier "VIP Table 2027" | Row with that tier | Review `unknown_tier`; nothing created |
| 14 | Shared inbox | Sponsor "Ana Ruiz", `events@example.com` | Buyer "Mark Lee", same email | Review `email_name_conflict`; new sponsor created |
| 15 | Same buyer, case and spaces | Sponsor `grace.kim@example.org`, Kim | Buyer ` Grace.Kim@Example.org `, Kim | Same sponsor |
| 16 | Guest on two orders | "Susan Cho" on sponsor A's order | Sponsor B lists "Susan Cho", no email | Review `possible_duplicate` (organization unknown) |
| 16b | Same email on two orders | "Susan Cho", susan@example.org, on sponsor A's order | Sponsor B lists her with the same email | Review `double_booked` |
| 17 | Name order swap | "Wei Chen", Harbor Health | "Chen Wei", Harbor Health, another order | Review `double_booked` (same words, same organization) |
| 18 | Full refund | Case 1 imported | Same purchase, fully refunded | Order and seat cancelled; review `refund` |
| 19 | Partial refund | $500 purchase | $250 refunded | Payment updated; order partially paid; in report |
| 20 | Guest text changed | Case 6 imported | Same purchase, a name changed | Guests unchanged; review `guest_text_changed` |
| 21 | Staff edit survives | Staff corrected a title | Same file re-imported | Title stays as staff set it |
| 22 | Purchase disappears | Two purchases imported | Next upload covers both dates, has one | Review `missing_from_source`; nothing cancelled |
| 23 | Missing required field | — | Row with no email | Rejected with row number; rest imports |
| 24 | Failed import rolls back | Any | File that fails partway | Nothing applied; run marked failed |
| 25 | Phone never imported | — | Row with a phone number | No phone stored anywhere from the import |
| 26 | Commas, no emails | 2-seat purchase | "Jane Doe, Sam Lee" | 2 guests pre-filled |
| 27 | Commas that don't fit | 2-seat purchase | "Jane Doe, Sam Lee, Ana Ruiz" | No guests; text shown for the sponsor |
| 28 | Couple | 2-seat purchase | "John and Mary Smith" | No guests; text shown for the sponsor |
| 29 | Family name first | — | "Chen Wei" | Badge, portal, and check-in show "Chen Wei" exactly |
| 30 | Tier renamed mid-campaign | Purchase imported under "Champion" | Same purchase, tier now "Champion Sponsor" | Recognized as the same purchase; nothing duplicated |
| 31 | Filtered export | Purchases from Feb and Mar imported | Upload with Mar only | No `missing_from_source` for Feb |
| 32 | Portal named first | Sponsor named 2 seats in the portal | Later export lists names | Portal names kept; review `guest_text_changed` |
| 33 | Same purchase from both sources | Purchase arrived by JSON sync | Same purchase in a CSV upload | Recognized by purchase key; nothing duplicated |
| 34 | Generic tier name | Mapping "Ticket" → Supporter | Row with Tier Purchased "Ticket" | Order on Supporter; no review item |
| 35 | Unmapped tier, mapped in review | No mapping for "Ticket" | 3 rows with "Ticket" | 1 `unknown_tier` item per row; mapping it saves "Ticket" → tier, re-run creates 3 orders, next upload raises no review |
| 36 | Tier mapping changed later | 2 orders imported via "Ticket" → Supporter | Mapping changed to Friend, file re-imported | Existing orders keep Supporter; change logged |
| 37b | Gala page not set | No page name for the gala | Any upload | Nothing imported; the page names in the file listed with row counts for staff to pick |
| 37 | Another gala page in the file | Page name "AAFE's 52nd Annual Gala" | Rows from that page plus 1 row from "Year-End Appeal" | 1 row skipped and listed in the report; others imported |
| 38 | Sync page filter | Page name "AAFE's 52nd Annual Gala" | JSON donations from that page and from "Year-End Appeal" | Only the gala page's donations imported |
