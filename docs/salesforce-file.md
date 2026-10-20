# Getting the gala into Salesforce by file

For Sarah Pritchard and Graybox, ahead of the technical meeting (before Oct 29), and for whoever runs the import after
each gala. It answers Sarah's question at the Oct 19 review: can the tool's downloads go straight into Salesforce?

**Short answer:** yes, for **who came**. One file after the gala, imported with Salesforce's Data Import Wizard. Some
columns need a decision from Graybox first (below).

## Two ways in, file first
1. **The file (recommended for now).** After the gala, a gala admin downloads the Salesforce file, and AAFE imports
   it. Nothing needs to stay signed in to Salesforce, and Graybox decides every field.
2. **The live sync ("Sync now"), later and only if AAFE wants it.** It sends sponsors, orders, payments and guests
   through Salesforce's API (`prototype/docs/BACKEND.md`, "Demo with a stand-in Salesforce"). Today it only talks to
   a stand-in, never a real org. Before it touches AAFE's org it needs a Salesforce sandbox, a sign-in that renews
   itself, and the decisions in Natalie's review of #190.

Either way, **Give Lively's own connector keeps sending online purchases**: the buyer as a Contact, the donation as
an Opportunity, and the event's Campaign. The tool adds what Give Lively doesn't know: who actually came, including
sponsors' guests, comps and walk-ins.

## The file
**Integrations & email → Download Salesforce file** (gala admins). The file:
- has **one row per person who checked in**, walk-ins included, for the current gala;
- **never includes** phones, food or access answers, or payment details;
- is recorded in the change log at every download.

Example, invented data, exactly as the file comes (`.csv` files stay out of the repo, so real exports never get in):
```
Capstone prototype — synthetic demonstration data only
First Name,Last Name,Email,Title,Account Name,Sponsor,Account ID,Opportunity ID,Guest Type,Checked In At,Check-in Method
Leah,Goldberg,leah.goldberg@guest.example.org,Chief of Staff,District 1 Council Office (synthetic),AAFE Executive Director's Office,,,Guest of AAFE,2027-05-27T22:43:21+00:00,qr
Bridget,Khan,bridget.khan@guest.example.org,Council Member,NYC Council (synthetic district),AAFE Executive Director's Office,,,Government or VIP,2027-05-27T22:47:28+00:00,search
Chidi,Okafor,chidi.okafor@guest.example.org,Staff Attorney,Riverside Legal Aid,Chidi Okafor,,,Ticket holder,2027-05-27T22:39:14+00:00,search
Evelyn,Park,evelyn.park@guest.example.org,Chief Executive Officer,Harborline Community Bank,Harborline Community Bank,001DEMO0000HARB,,Sponsor guest,2027-05-27T22:31:00+00:00,qr
,Riley Walkin,,,,,,,Walk-in,2027-05-27T23:11:00+00:00,exception
Arthur,Wong,arthur.wong@guest.example.org,Executive Director,Meridian Family Foundation,Meridian Family Foundation,001DEMO0000MERI,,Sponsor guest,2027-05-27T22:35:07+00:00,search
```

## Column by column
| Column | What it holds | Suggested Salesforce field | Notes |
| --- | --- | --- | --- |
| First Name | Guest's given name | Contact: First Name | Empty for a one-word name and for walk-ins |
| Last Name | Guest's family name, or the whole name when there's only one word | Contact: Last Name | Salesforce requires it, so it's never empty |
| Email | Guest's email | Contact: Email, the **match key** | Empty for walk-ins and guests the sponsor gave no email for |
| Title | Job title as printed on the badge | Contact: Title | |
| Account Name | The **guest's own organization** | Contact: Account Name, or leave unmapped | See gap 2 |
| Sponsor | The sponsor whose table or tickets the guest came on | Leave unmapped, or a custom Campaign Member field | No standard field |
| Account ID | The **sponsor's** Salesforce Account, if the live sync made one | Leave unmapped in a file-only setup | Empty unless the live sync runs; see gap 2 |
| Opportunity ID | The sponsor's order in Salesforce, if the live sync made one | Leave unmapped | Same |
| Guest Type | Sponsor guest, Ticket holder, Guest of AAFE, Government or VIP, AAFE staff, Event volunteer, Event staff, Walk-in | A custom Campaign Member field, if AAFE wants it | |
| Checked In At | Arrival time, UTC, ISO 8601 (`22:31:00+00:00` is 6:31 PM in New York) | A custom date/time field, or leave unmapped | See gap 4 |
| Check-in Method | qr, search (found by name at the door) or exception (walk-in or not on the list) | Leave unmapped | |

## Importing it (suggested; Graybox to confirm in AAFE's org)
Salesforce's Data Import Wizard, "Contacts and Leads", new and existing records:
1. **Delete line 1 first** if it says "synthetic demonstration data" (gap 1). The column names must be the first line.
2. **Match Contacts by email,** the way Give Lively's connector does, so a guest Salesforce already knows is updated,
   not added twice.
3. **Add every imported Contact to the gala's Campaign** (the one Give Lively made for the event page) with the
   member status **Attended**: everyone in the file came.
4. Map the columns as in the table above.

## What the file doesn't carry
- **Who didn't come.** The file lists arrivals only. To mark Registered or No Show, the live sync does it. Or the
  **Full guest list** report (Reports page; every guest, with a "Came" column) can be imported as a second Campaign
  Member file. Map only the names, Email and Came; **never** its Food, Accessibility or Relationship note columns.
- **Sponsors, orders and payments by check, ACH or wire.** These are what Give Lively doesn't send. The Data Import
  Wizard doesn't import Opportunities or payments. They need Salesforce's Data Loader, fed from the **Payments**
  report (Reports page), or the live sync later.
- **Phones, food or access answers, notes.** These never leave the tool (`docs/data-handling.md`).

## Gaps found while writing this
1. **Line 1 and the file name say "synthetic" on every gala**, real ones included.
   - Five downloads always start with the notice line: badges, the check-in list, the Salesforce file, the guest
     list and payments.
   - Six end in `-SYNTHETIC.csv`: those five and the activity log.
   - The Reports page already does it right: the notice and `-DEMO` only for a demo gala.
   - Proposed fix: the same rule for every download (a staff app change, for Natalie to review).
2. **Account Name and Account ID point at different organizations.** Account Name is the guest's own organization;
   Account ID is the sponsor's Account. Mapping Account Name makes the wizard match or create an Account for every
   guest's organization, which Natalie's review flags as a duplicate risk. **Graybox decides** which one guests are
   linked to: their own organization, the sponsor, or neither.
3. **Walk-ins and guests without an email** can't be matched, so every import would add them as new Contacts.
   Suggested: leave those rows out, or match them by hand.
4. **Times are in UTC.** Graybox to check the wizard reads `2027-05-27T22:31:00+00:00`. If it doesn't, the file can
   carry a plain New York date and time instead.
5. **Account ID and Opportunity ID are empty without the live sync.** In a file-only setup, ignore them.

## For the Graybox meeting
- Which Campaign the gala uses, and whether Attended, Registered and No Show exist as member statuses.
- Gap 2: should guests be linked to an Account, and which one?
- Who belongs in Salesforce: every guest who came, or only donors and sponsors? (Natalie's review, point 6: the tool
  deletes guests' contact details 60 days after the gala, but copies in Salesforce stay.)
- For checks, ACH and wires: the Payments report and Data Loader, or wait for the live sync? NPSP may create payment
  records automatically for each Opportunity (Natalie's review, point 3).
- If the live sync comes later: a sandbox to test in, a connected app, and the setup list in `BACKEND.md`.

Sources: `staff_export_salesforce()` in `prototype/database/backend.sql`; `salesforceCsv()` in
`prototype/staff-app/src/exports.ts`; Natalie's "PR 190 Salesforce Review" (Oct 19).
