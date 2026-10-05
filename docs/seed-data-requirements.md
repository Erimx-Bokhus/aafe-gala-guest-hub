# Seed data requirements

What the team's synthetic seed data must contain so the import tests in
`docs/import-matching-spec.md` (section 11) and the demo have something real to work on.
Case numbers below refer to that table. Revised Oct 5 for the real Give Lively export shape.

## Rules for all seed data

- **Invented only** (hard rule 1). No real AAFE donors, staff, sponsors, or officials, and no names
  of real companies. Email addresses use the reserved domains `example.com`, `example.org`, or
  `example.net` only, so nothing can ever be mailed to a real inbox. Phone numbers use the
  `555-01xx` fiction range.
- **No payment details** beyond method, date, status, and amount (hard rule 2).
- **Seat counts come from the tiers.** Tiers follow AAFE's 2026 flyer (`docs/decisions.md`, Oct 5).
  Tests read the seat count from the tier, never hard-code it.
- Seed CSVs live under a `seed/` or `fixtures/` folder (the only CSVs `.gitignore` allows).

## Starting point

Natalie's seed data (`seed/natalie-prototype/`, and `prototype/database/seed.sql` in her backend) is the
demo's base state: galas, staff, tiers, sponsors, orders, payments, guests, seats, and check-ins. The
records below are added alongside it for the import tests; reuse her staff and tiers rather than
inventing a second set.

## Three layers

1. **Base database state** (rows loaded before any import).
2. **`givelively-export-1.csv`**: a Give Lively ticket export **in the real format**: the same column
   headers as AAFE's export (`docs/aafe-materials-2026-10-05.md`), **one row per purchase**, no
   transaction ID, and guests typed into the free-text "Please list the name(s) and email address(es)
   of all guests…" column. Ends with two fully blank rows, as the real one does.
3. **`givelively-export-2.csv`**: the same export taken later, with changes. Importing it after file 1
   exercises the re-import cases.

## 1. Base database state

| Item | Needed for |
| --- | --- |
| 2027 gala, staff with each role, tiers from the 2026 flyer | Everything |
| **No** tier named "VIP Table 2027" | Case 13 |
| Sponsor "Ana Ruiz", `events@example.com` | Case 14 |
| Sponsor with email `grace.kim@example.org`, contact last name Kim | Case 15 |
| An order for sponsor A with guest "Susan Cho" | Case 16 |
| A guest "Wei Chen", Harbor Health, on some order | Case 17 |
| A comp order for an invented elected official | Comps, no balance owed |
| A sponsorship with all seats unnamed, link sent 2+ weeks ago | Missing-names view, reminder drafts |

Case 21 needs a staff edit between the two imports: correct the title of one guest created by file 1.

## 2. `givelively-export-1.csv`

One row per purchase. "Guest text" is the free-text guest-list column.

| Row | Needed for |
| --- | --- |
| 1 ticket; guest text "me" | Case 1 |
| 2 tickets by a coordinator; guest text lists 2 colleagues, each followed by the coordinator's own email | Case 2 |
| Two identical rows (same buyer, time, tier) | Case 4 |
| Guest text with two names and emails on separate lines | Cases 6, 20 |
| Guest text "1. Jane Doe 2. Sam Lee" | Case 7 |
| Guest text with two names and emails on one line, comma-separated | Case 8 |
| Guest text "TBD" | Case 9 |
| Guest text with a one-word name | Case 10 |
| 2-seat purchase whose guest text lists 3 names | Case 11 |
| Champion sponsorship (6 seats) with 3 names | Case 12 |
| Tier Purchased "VIP Table 2027" | Case 13 |
| Buyer "Mark Lee", `events@example.com` | Case 14 |
| Buyer ` Grace.Kim@Example.org ` (spaces, capitals), last name Kim | Case 15 |
| Sponsor B's purchase listing "Susan Cho" | Case 16 |
| Guest "Chen Wei", Harbor Health | Case 17 |
| A $500 purchase | Cases 18, 19 |
| A row with no Email | Case 23 |
| A row with a phone number filled in | Case 25 |
| Names with non-ASCII characters (accented Spanish names, a Chinese name in Han characters, a Korean name in Hangul) | Normalization, badges |

## 3. `givelively-export-2.csv`

The same export taken later, with these differences only:

| Change from file 1 | Needed for |
| --- | --- |
| Case 1's purchase refunded in full | Case 18 |
| The $500 purchase with $250 refunded | Case 19 |
| One name changed in the separate-lines guest text | Case 20 |
| One purchase removed | Case 22 |

Also keep an exact copy of file 1 to re-import for cases 3 and 21.

## Demo volume (not needed by tests)

For a believable dashboard and check-in demo, shaped like AAFE's 2026 gala: about 550 guests across
sponsor guests, ticket holders, comps, government/VIP, and staff; roughly 200 with guaranteed tables;
mixed payment methods (Give Lively, check, ACH, comp); and at least a third of sponsor seats still unnamed
so the reminder tooling has something to do.
