# Seed data requirements

What the team's synthetic seed data must contain so the import tests in
`docs/import-matching-spec.md` (section 10) and the demo have something real to work on.
Case numbers below refer to that table.

## Rules for all seed data

- **Invented only** (hard rule 1). No real AAFE donors, staff, sponsors, or officials, and no names
  of real companies. Email addresses use the reserved domains `example.com`, `example.org`, or
  `example.net` only, so nothing can ever be mailed to a real inbox. Phone numbers use the
  `555-01xx` fiction range.
- **No payment details** beyond method, date, status, and amount (hard rule 2).
- **Package seat counts are placeholders.** The 2027 tiers are pending (`docs/decisions.md`). Tests
  must read `seat_count` from the package, never hard-code 7 or 10.
- Seed CSVs live under a `seed/` or `fixtures/` folder (the only CSVs `.gitignore` allows).

## Three layers

1. **Base database state** (rows loaded before any import).
2. **`givelively-export-1.csv`**: the first Give Lively attendee export.
3. **`givelively-export-2.csv`**: the next export of the same report, with changes. Importing it
   after file 1 exercises the re-import cases.

## 1. Base database state

| Item | Needed for |
| --- | --- |
| 1 gala year (2027) and 4 staff users: 1 admin, 2 staff (relationship owners), 1 check-in | Owner grouping, roles |
| Packages: at least 2 individual ticket types and 3 sponsorship tiers with different `seat_count` | Seat creation |
| Ticket type → package mapping for every ticket type in file 1 **except one** | Case 17 |
| Contact "Grace Kim", Lotus Bank, `grace.kim@example.org` | Cases 5, 6 |
| Contact "Wei Chen", Harbor Health, no email | Case 7 |
| Contact "Daniel Park", organization A, no email | Case 8 |
| Contact "Ana Ruiz", `events@example.com` | Case 9 |
| Sponsorship A (staff entry, check, received) with "Susan Cho" named on one seat | Case 10 |
| A check pledge (staff entry, `pledged`) whose purchaser has an email that appears in file 1 | Case 20 |
| A comp commitment (kind `comp`, payment `n/a`) for an invented elected official, owner assigned | Comps, no balance owed |
| A sponsorship with a live sponsor link, some seats named via the portal | Portal demo |
| A sponsorship with all seats unnamed, link sent 2+ weeks ago, no response | Missing-names view, reminder drafts |
| At least one contact with no relationship owner | "No owner" view |

Cases 14 and 15 need edits on records that came from file 1, so the test applies them **between**
the two imports: a staff override setting the "VP" guest's title to "CFO", and a sponsor naming
an unnamed seat of the case 11 sponsorship through the portal.

## 2. `givelively-export-1.csv`

| Rows | Needed for |
| --- | --- |
| One ticket where purchaser = attendee | Case 1 |
| One order of 2 tickets bought by a coordinator for two colleagues, attendee email = coordinator's email | Case 2 |
| "Grace.Kim@Example.org" with surrounding spaces as an attendee email | Case 5 |
| "Dr. Grace  Kim", "Lotus Bank, Inc." (double space, honorific, legal suffix) | Case 6 |
| "Chen Wei", Harbor Health, no email | Case 7 |
| "Daniel Park", organization B, no email | Case 8 |
| "Mark Lee", `events@example.com` on a different order from Ana Ruiz | Case 9 |
| Sponsorship B naming "Susan Cho" with the same email as in the base state | Case 10 |
| A sponsorship order with 3 attendee rows for a 10-seat package (or whatever the tier holds) | Case 11 |
| A ticket for the check-pledge purchaser's email | Case 20 |
| A row with the unmapped ticket type | Case 17 |
| A row with no transaction ID | Case 16 |
| Two rows with the same ticket ID | Case 4 |
| A 2-seat order with 3 attendee rows | Case 18 |
| An attendee "Jon Tan" | Case 13 |
| An attendee whose title is "VP" | Case 14 |
| An order at $500 | Case 21 |
| Names with non-ASCII characters (e.g. accented Spanish names, a Chinese name in Han characters, a Korean name in Hangul) | Normalization, multilingual form, badges |

## 3. `givelively-export-2.csv`

Same report as file 1, with these differences only:

| Change from file 1 | Needed for |
| --- | --- |
| Case 1's ticket now has status refunded | Case 12 |
| "Jon Tan" now "Jonathan Tan", same ticket ID | Case 13 |
| The overridden guest's title now "SVP" | Case 14 |
| The case 11 sponsorship unchanged: the seat the sponsor named is still blank in Give Lively | Case 15 |
| One order from file 1 removed entirely | Case 19 |
| The $500 order now $250 | Case 21 |

Also keep an exact copy of file 1 to re-import for case 3.

## Demo volume (not needed by tests)

For a believable dashboard and check-in demo: about 300 seated guests across about 25 sponsors and
150 individual tickets, mixed payment methods (Give Lively, check, ACH, comp), several table
numbers, and at least a third of sponsor seats still unnamed (Natalie's research: real sponsors do not
respond instantly, and the reminder tooling needs something to do).
