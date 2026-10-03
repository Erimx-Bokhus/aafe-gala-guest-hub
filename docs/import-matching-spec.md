# Give Lively import and matching spec

Status: draft, Oct 3 2026. Written before AAFE's sample Give Lively exports arrive (promised ~Oct 8).
Column names and the per-ticket ID below are assumptions; revisit this spec when the samples land.

Applies hard rules 1, 4, 6, and 7 in `CLAUDE.md`. Table names follow `docs/data-model.md` (draft schema)
and its merge plan with Natalie's prototype schema (`commitments` = her `orders`, `contacts` = her
`guests` and `sponsors`).

The import logic lives in its own module with no UI or HTTP code in it, so it can be tested on its own
against the cases at the end of this document.

## 1. Input

A CSV exported from Give Lively's event attendee report, uploaded by staff. One row per ticket.
Rows from the same purchase share a transaction ID and repeat the purchaser's details.

Columns are mapped once per source and saved, so staff do not remap every upload:

| Field | Required | Notes |
| --- | --- | --- |
| `transaction_id` | yes | Give Lively donation/transaction ID; groups rows into one order |
| `ticket_id` | if present | Per-ticket ID. **Open:** confirm the export has one (see section 9) |
| `ticket_type` | yes | Ticket or sponsorship name; mapped to a package (section 3) |
| `purchaser_first_name`, `purchaser_last_name` | yes | |
| `purchaser_email` | yes | |
| `purchaser_organization` | no | |
| `attendee_first_name`, `attendee_last_name` | no | Blank means an unnamed seat |
| `attendee_email`, `attendee_title`, `attendee_organization` | no | |
| `amount` | yes | Parsed to integer cents |
| `purchased_at` | yes | Parsed to a timestamp in America/New_York |
| `status` | no | e.g. completed / refunded, if the export carries it |

Anything else in the row is kept in `source_records.raw` but not used.

## 2. Pipeline

One import is one database transaction. If any step throws, nothing is applied and the run is
recorded as `failed` with the error.

1. **Record the run.** `import_runs` row: who, when, file name, SHA-256 of the file.
2. **Parse and validate** each row. A row with a missing required field, an unparseable amount or
   date, or no mapping for its columns is **rejected**: it is listed in the report with its row number
   and reason and goes no further. A second row with the same `source_id` in one file is also rejected
(duplicate). Rejected rows are not review items; the fix is a corrected file.
3. **Stage.** Upsert each valid row into `source_records` keyed by `(source, source_id)`, storing the
   raw row and a hash of its mapped fields. `source_id` is `ticket_id` if the export has one,
   otherwise `transaction_id:n` where `n` is the row's position within its transaction (see section 9).
   A row whose hash is unchanged since the last import is **unchanged** and skipped.
4. **Group** new and changed rows by `transaction_id` into orders.
5. **Match** purchaser and attendees to contacts (section 4).
6. **Apply** to commitments, seats, and contacts, respecting overrides (section 6).
7. **Detect** missing rows and conflicts (section 5), add review items.
8. **Report** (section 7) and mark the run `succeeded`.

Re-importing the same file changes nothing and reports every row as unchanged.

## 3. Rows to orders, guests, and seats

- **Order → commitment.** One commitment per `transaction_id`, `source = givelively`,
  `payment_method = givelively`, `payment_status = received`, amount = sum of the rows.
- **Package.** `ticket_type` is looked up in a staff-maintained table of ticket type → package
  (Give Lively ticket names change between years; packages are per `gala_year`). A ticket type with
  no mapping sends the whole order to review (`unknown_ticket_type`) and creates nothing until staff
  map it.
- **Kind.** The package decides it: individual tickets → `ticket`, sponsorship packages → `sponsorship`.
- **Seats.**
  - Ticket orders: one seat per row.
  - Sponsorship orders: `package.seat_count` seats, whatever the row count. Attendee rows fill seats
    in row order; the rest stay unnamed (`attendee_id IS NULL`).
  - More named attendees than seats → review (`seat_overflow`); extra names are held, not dropped.
- **Purchaser vs attendee.** The purchaser is a contact linked as `commitments.purchaser_id`. An
  attendee row with a name becomes (or matches) a separate contact linked to the seat. A purchaser is
  only seated if a row names them as an attendee.
- **Seat source link.** Each seat created from a row stores that row's `source_record_id`, so the
  next import of the same row updates the same seat (`source_record_id` in `docs/data-model.md`).
- **Sponsor link.** A new sponsorship order with unnamed seats gets a `sponsor_links` row (random
  token, hashed) and a **draft** email in the approval queue. Nothing is sent by the import (rule 4).
- **Relationship owner.** Not in the Give Lively data. Left blank and shown in the "no owner" view;
  if the purchaser already has an owner on another commitment, that owner is suggested, not set.

## 4. Matching

Each purchaser and named attendee is matched to an existing contact, in this order. The first rule
that produces a result wins.

**Normalization** (used by every rule): Unicode NFKC, case-folded, trimmed, inner whitespace
collapsed, punctuation removed. Names also drop honorifics and suffixes (Dr, Mr, Ms, Mrs, Hon, Jr,
Sr, II, III). Organizations also drop legal suffixes (Inc, LLC, LLP, Corp, Co, Ltd), a leading
"The", and treat `&` as "and". Emails are trimmed and lower-cased only.

1. **Give Lively ID.** The row's `source_id` is already linked to a contact from an earlier import →
   that contact. No review.
2. **Email.** Exactly one contact has the same normalized email **and** the same normalized last name
   → match. Same email but a different last name → review (`email_name_conflict`); a shared inbox is
   common and must not merge two people.
   *Exception:* an attendee email equal to the purchaser's email on the same order is the purchaser's
   inbox, not the attendee's. It is ignored for matching and not stored on the attendee.
3. **Name and organization.** Exactly one contact with the same normalized full name and the same
   normalized organization, and no conflicting email on file → match.
4. **Possible duplicates → review, never auto-merged:**
   - same name tokens in a different order ("Chen Wei" / "Wei Chen"), same organization;
   - same first initial and last name, same organization;
   - same full name, different or missing organization.

   The review item names the candidate contact and the rule that flagged it.
5. **No match** → new contact.

Nicknames (Bob / Robert) and typos are not detected. This is deliberate: no fuzzy-matching library to
maintain, and every heuristic above is explainable to staff. Staff can merge such duplicates by hand
from the guest list.

## 5. Conflicts and missing rows

- **Guest under two sponsors.** A matched attendee already seated on a different commitment →
  review (`double_booked`). Both seats keep the guest until staff choose; the other seat then
  returns to unnamed.
- **Refund.** A row whose `status` is refunded, or an order whose amount drops to zero → commitment
  `payment_status = refunded`, seats marked `cancelled`, and a
  review item (`refund`) so the relationship owner can follow up. Nothing is deleted; badges and
  check-in skip cancelled seats.
- **Amount change** (partial refund or edit in Give Lively) → amount updated, listed in the report.
- **Row missing from a later export.** Give Lively exports are full snapshots, so a row seen before
  and absent now is reported as `missing_from_source` and added to review. Nothing is deleted or
  cancelled automatically: a filtered or partial export must not wipe guests.

## 6. Staff corrections survive re-import

Every editable field has one effective value, in this order of precedence:

1. **Staff edit** (`field_overrides`, `set_by` = staff)
2. **Sponsor portal edit** (`field_overrides`, `set_by` = sponsor link)
3. **Latest import value**

Import only ever writes the import layer. It never writes or deletes an override. So:

- If a field has no override, the new import value takes effect and the change is logged in
  `audit_log` with actor `import:<run id>`.
- If a field has an override and the import value **changed** since the last import, the override
  stays in effect and the report lists it under "held by staff/sponsor edits" with old and new import
  values, so staff can decide whether to clear the override.
- If the import value now equals the override, the report says so; the override is left in place.
- A blank import value never clears a value entered by staff or a sponsor (e.g. a sponsor names a
  guest in the portal; Give Lively still shows the seat unnamed).

The original source value is always available in `source_records.raw`.

## 7. Import report

Shown to staff at the end of every run and kept with the `import_runs` row:

- File name, file hash, who ran it, start and finish time, status.
- Counts: rows read, **new**, **updated**, **unchanged**, **rejected**, **sent to review**
  (`n_new`, `n_updated`, `n_unchanged`, `n_rejected`, `n_review` in `import_runs`).
- Rejected rows: row number and reason.
- Review items created: reason code, row number, candidate.
- Changes held by overrides: field, override value, old and new import values.
- Rows missing from this file that were in the last one.
- New sponsor-link email drafts waiting for approval.

The dashboard shows the time of the last successful import, so stale data is visible.
The report is staff-only and is never sent to an AI service (rule 5).

## 8. Review queue

| Reason code | Raised when | Staff choices |
| --- | --- | --- |
| `possible_duplicate` | Section 4 rule 4 | Same person (merge) · Different person (new contact) |
| `email_name_conflict` | Same email, different last name | Same person · Different person |
| `double_booked` | Guest already seated on another commitment | Keep on A · Keep on B · Keep both (data error) |
| `seat_overflow` | More names than seats | Add seats · Drop a name |
| `unknown_ticket_type` | Ticket type has no package mapping | Map ticket type to package, then re-run the order |
| `refund` | Refunded order | Acknowledge (seats stay cancelled) · Reinstate |
| `missing_from_source` | Row absent from later export | Cancel seats · Keep (export was partial) |

A resolution records who resolved it and when, and is remembered: the same row with the same data
does not raise the same item on the next import.

## 9. Open questions (need AAFE's sample exports)

- Does the attendee export carry a per-ticket ID? If not, `transaction_id:n` breaks when Give Lively
  reorders rows within a transaction; fall back to matching rows within a transaction by attendee
  name before position.
- Does the export carry refund status, or do refunds only show as a separate report?
- Exact column headers, date format, and whether amounts include the donor-covered fee.
- Are sponsorships bought on Give Lively exported in the same report as tickets?

## 10. Test cases

Each case is a unit test of the import module: starting state, one or more CSV files, expected result.
Seed data for them is listed in `docs/seed-data-requirements.md`.

| # | Case | Given | Import | Expected |
| --- | --- | --- | --- | --- |
| 1 | New ticket, purchaser attends | Empty DB | 1 row, attendee = purchaser | 1 contact, 1 ticket commitment, 1 named seat |
| 2 | Coordinator buys for others | Empty DB | 2 rows, attendees ≠ purchaser, attendee email = purchaser email | 3 contacts; purchaser unseated; attendees have no email stored |
| 3 | Same file twice | Case 1 imported | Same file again | 0 new, 0 updated, all unchanged; no audit entries |
| 4 | Duplicate row in one file | Empty DB | Two rows with the same `ticket_id` | 1 seat; second row rejected as a duplicate (needs per-ticket ID, section 9) |
| 5 | Email match, case/space variant | Contact `grace.kim@example.org` | Row with ` Grace.Kim@Example.org ` | Matched, no new contact |
| 6 | Name variant normalizes | Contact "Grace Kim", org "Lotus Bank" | "Dr. Grace  Kim", "Lotus Bank, Inc." | Matched by name + org |
| 7 | Name order swap | Contact "Wei Chen", org "Harbor Health" | "Chen Wei", "Harbor Health", no email | Review `possible_duplicate`; no new contact until resolved |
| 8 | Same name, other org | Contact "Daniel Park", org A | "Daniel Park", org B, no email | Review `possible_duplicate` |
| 9 | Shared inbox, different person | Contact "Ana Ruiz", `events@example.com` | "Mark Lee", `events@example.com`, different order | Review `email_name_conflict`; not merged |
| 10 | Guest under two sponsors | "Susan Cho" seated on sponsor A | Sponsor B order names "Susan Cho" (same email) | Matched contact; review `double_booked`; seated on both until resolved |
| 11 | Sponsorship with partial names | Empty DB | Sponsorship order, package of 10 seats, 3 attendee rows | 10 seats, 3 named, 7 unnamed; sponsor link + draft email queued, not sent |
| 12 | Refund | Case 1 imported | Same row, status refunded | `payment_status = refunded`, seat cancelled, review `refund` |
| 13 | Re-import, changed name, no override | Seat from import named "Jon Tan" | Same `source_id`, "Jonathan Tan" | Seat attendee updated; audit entry by import |
| 14 | Re-import, changed title, staff override | Staff corrected title to "CFO" | Import title changes "VP" → "SVP" | Title stays "CFO"; report lists held change |
| 15 | Sponsor-named seat, import blank | Sponsor named seat 4 in portal | Re-import, seat 4 attendee blank | Sponsor's name kept |
| 16 | Missing required field | — | Row with no transaction ID | Rejected with row number; rest of file imports |
| 17 | Unknown ticket type | No mapping for "VIP Table 2027" | Order with that type | Review `unknown_ticket_type`; nothing created |
| 18 | Too many names | Package of 2 seats | 3 attendee rows | 2 seats filled; review `seat_overflow` holds the third |
| 19 | Row disappears | Two orders imported | Next file has only one | Review `missing_from_source`; nothing deleted |
| 20 | Check pledge, then Give Lively purchase | Contact from staff-entered check pledge | Ticket row with same email | Matched to existing contact; separate commitment |
| 21 | Amount change | Order imported at $500 | Same order at $250 | Amount updated; listed in report |
| 22 | Failed import rolls back | Any | File that throws mid-apply | No changes; run status `failed` |
