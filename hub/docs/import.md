# Import and matching
<!-- modified Oct 5 -->

How a Give Lively export becomes guests, orders, and seats without duplicates, and why a staff correction is never lost. Plain rules, no AI. Full spec: `docs/import-matching-spec.md` in the repo.

Updated Oct 5 for AAFE's real Give Lively export: one row per purchase, no transaction ID, and guest names typed into one free-text box. The full spec in the repo is being revised to match.

## What happens on every import

```steps
Upload | Staff upload the Give Lively ticket export. Columns are mapped once and remembered.
Check | Rows missing a required field, or with an unreadable amount or date, are rejected with their row number and reason.
Compare | Each row is compared with the last import. Unchanged rows are skipped, so re-importing the same file changes nothing.
Identify | Each row is one purchase. With no transaction ID, a purchase is recognized by the buyer's email, purchase time, and tier, so re-importing never duplicates it.
Split | The free-text guest list is split into names and emails; anything unclear goes to staff review.
Match | Purchaser and each named guest are matched to people already in the list (rules below).
Apply | New and changed data is written, except where a staff member or sponsor has corrected it.
Report | A summary: new, updated, unchanged, rejected, and sent to review, with every held change listed.
```

```notes
One import is all-or-nothing: if anything fails partway, nothing is applied and the run is marked failed. Staff never see half an import.
```

## Orders, guests, and seats

- **One order per Give Lively purchase row.** It records the tier, amount, refund, and Give Lively as the payment method.
- **Ticket orders** get one seat per ticket. **Sponsorships** get the package's full seat count, whatever Give Lively sent; names fill seats in order and the rest stay open.
- **The buyer is not seated** unless a row names them as a guest. A coordinator buying for colleagues stays the contact; the colleagues get the badges.
- **A new sponsorship with open seats** gets a private sponsor link and a **draft** email in the approval queue. The import never sends anything.
- **Relationship owner** isn't in Give Lively's data. New guests show in the "no owner" view; if the buyer already has an owner, it's suggested, not set.

## How matching works

The first check that answers yes decides. Names are compared after removing case, extra spaces, punctuation, titles (Dr, Hon, Jr), and company suffixes (Inc, LLC).

```decision
start: A named purchaser or guest from the export
Seen this Give Lively row before? | Same person as last time | update
Same email and same last name? | Same person | update
Same email, different last name? | Review: a shared inbox must not merge two people | review
Same name and same organization? | Same person | update
Same name in another order, or another organization? | Review: staff confirm or keep separate | review
else | New person | new
```

"Wei Chen" and "Chen Wei" at the same organization goes to review, not an automatic merge. Nicknames ("Bob" and "Robert") and typos aren't detected: staff merge those by hand. Fewer clever rules means every decision can be explained.

When a coordinator's email appears on every guest row of their order, it's treated as the coordinator's inbox and not stored on the guests.

## Corrections survive the next import

Every field shows one value, chosen in this order:

1. **A staff edit**
2. **A sponsor's edit** on their private link
3. **The latest Give Lively value**

An import only updates the Give Lively layer. If Give Lively changes a field that staff or a sponsor has corrected, the correction stays and the report lists the held change, so staff can decide. A blank in Give Lively never erases a name a sponsor typed in. The original Give Lively value is always kept.

## When something needs a person

| Reason | When | Staff choose |
| --- | --- | --- |
| Possible duplicate | A close but not certain name match | Same person · Different person |
| Shared email | Same email, different last name | Same person · Different person |
| Guest under two sponsors | Someone named on two orders | Keep on one · Keep both |
| Too many names | More names than seats | Add seats · Drop a name |
| Unknown ticket type | A Give Lively ticket name not linked to a package | Link it, then re-run |
| Refund | Give Lively shows the order refunded | Keep seats cancelled · Reinstate |
| Missing from export | A row that was there last time isn't now | Cancel seats · Keep (partial export) |

Nothing is deleted automatically. Refunded seats are cancelled, not removed, and drop out of badges and check-in. Each resolution is remembered, so the same row doesn't ask twice.

## What AAFE's export answered
<!-- team -->
<!-- updated Oct 5 -->

- **Per-ticket ID:** none, and no transaction ID either. A purchase is keyed on email + purchase time + tier.
- **Refunds:** yes, an "Amount Refunded" column and a "Status" column.
- **Column headers and formats:** received. Dates look like `2026-02-05 05:14:46 PM EST`; amounts like `$1,000.00`; the donor-covered fee is its own column.
- **Guest names:** one free-text answer per purchase ("Please list the name(s) and email address(es) of all guests…"). The sample has one row, so we don't yet know how messy real answers are.
- **Still open:** whether sponsorships bought on Give Lively appear in the same export (the "Tier Category" column suggests they do).

The test cases below are being updated to match: cases that relied on ticket IDs change, and cases for free-text guest lists are added.

## Earlier questions
<!-- team -->

- Does the attendee export carry a **per-ticket ID**? Without one, rows are identified by their position in the transaction, which breaks if Give Lively reorders them.
- Does it show **refunds**, or are they only in another report?
- Exact column headers, date format, and whether amounts include the donor-covered fee.
- Are Give Lively sponsorships in the same report as tickets?
- **Which report.** Give Lively's "Line Items (All)" purchase report has the transaction ID (Natalie's prototype imports it); the attendee report has guest names. Likely both, joined on transaction ID.

## Test cases
<!-- team -->

Each is a unit test of the import module. Seed data for them is listed below.

| # | Case | Expected |
| --- | --- | --- |
| 1 | New ticket, buyer attends | 1 guest, 1 order, 1 named seat |
| 2 | Coordinator buys 2 for colleagues | Buyer unseated; colleagues seated, coordinator's email not copied to them |
| 3 | Same file imported twice | Nothing changes |
| 4 | Same ticket ID twice in one file | 1 seat; second row rejected |
| 5 | Email with different case and spaces | Matched |
| 6 | "Dr. Grace  Kim", "Lotus Bank, Inc." | Matched to Grace Kim, Lotus Bank |
| 7 | "Chen Wei" vs "Wei Chen", same organization | Review |
| 8 | Same name, other organization | Review |
| 9 | Shared inbox, different person | Review, not merged |
| 10 | Guest named by two sponsors | Review; on both until resolved |
| 11 | Sponsorship with 3 of 10 names | 10 seats, 7 open, sponsor link and draft email queued |
| 12 | Refund | Order refunded, seat cancelled, review |
| 13 | Name changed, no correction | Updated |
| 14 | Title changed, staff corrected it | Correction kept; change held in report |
| 15 | Sponsor named a seat, Give Lively blank | Sponsor's name kept |
| 16 | Row with no transaction ID | Rejected; rest imports |
| 17 | Unknown ticket type | Review; nothing created |
| 18 | 3 names for 2 seats | 2 filled; review holds the third |
| 19 | Order missing from later export | Review; nothing deleted |
| 20 | Check pledge, then a Give Lively ticket, same email | Same person, separate orders |
| 21 | Amount drops $500 → $250 | Updated, listed in report |
| 22 | Import fails partway | Nothing applied; run marked failed |

## Seed data the tests need
<!-- team -->

Three layers, all invented (emails on `example.com`/`.org`/`.net` only; seat counts read from packages, never hard-coded). Full list: `docs/seed-data-requirements.md`.

```layers
Base data | Staff and packages — 4 staff, 2 ticket types, 3 sponsor tiers; Known guests — Grace Kim, Wei Chen, Daniel Park, Ana Ruiz; Existing orders — a check pledge, a comp, a sponsor with Susan Cho named, an unresponsive sponsor
Export 1 | Every match case — variants, swaps, shared inbox, second sponsor; Every reject case — no transaction ID, duplicate ticket ID, unknown ticket type; Non-English names — Spanish accents, Chinese, Korean
Export 2 | The same report later — a refund, a name change, a title change under a correction, a missing order, a lower amount
```

For the demo itself: about 300 seated guests, 25 sponsors, 150 single tickets, mixed payment methods, and at least a third of sponsor seats still unnamed so the reminders have work to do.
