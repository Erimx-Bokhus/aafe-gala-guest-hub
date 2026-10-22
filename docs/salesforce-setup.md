# Salesforce: setup and decisions for AAFE and Idlewild Partners

Written by Natalie Walker, product lead (Oct 20, 2026; updated Oct 21 with AAFE's answer), from her review of #190 and the fixes in #213.

For the technical meeting with **Idlewild Partners**, the firm building and configuring AAFE's Salesforce (requested by
AAFE's gala lead at the Oct 19 midpoint check-in). It lists what the gala tool can send to Salesforce, what Idlewild
would set up, and the decisions that are AAFE's and Idlewild's to make. Code: `prototype/supabase/functions/_shared/salesforce.ts`; technical detail:
`prototype/docs/BACKEND.md` ("Demo with a stand-in Salesforce"). Research behind the open questions: Aisling's notes on
#213 and her flow chart (https://claude.ai/artifact/78x5YhYbs9C1ToWwC9yxWq).

## AAFE's answer: NPSP, with Give Lively connected

**Answered Oct 21, 2026 (AAFE):** "AAFE is currently implementing the Salesforce Nonprofit Success Pack, and our
instance will be fully integrated with GiveLively. GreyBox is not a Salesforce consulting firm. We are working instead
with a group called Idlewild Partners to build out and configure our Salesforce instance."

What that means for the gala tool:

| | Who sends it to Salesforce |
| --- | --- |
| Online tickets and sponsorships, the event's Campaign, ticket tiers, processing fees, each tier's tax-deductible amount | **Give Lively's own Salesforce app** (it works with NPSP) |
| Sponsors who pay by check, ACH or wire, their pledges and payments | **The gala tool** (automatic sync, or a file) |
| Guests, who came, and walk-ins | **The gala tool**: Give Lively doesn't send guests or attendance |

- **The automatic sync fits as built.** It was written for NPSP: Opportunities, `npe01__OppPayment__c` and household
  accounts. It reuses Give Lively's Campaign for the gala and matches people by email the way Give Lively does, so
  nothing is sent twice.
- **Still to confirm with Idlewild:** whether NPSP creates payment records itself when a pledge is added (then
  `SALESFORCE_SEND_PAYMENTS=false`), which guests belong in Salesforce, and the setup list below.
- **Greybox Creative** is AAFE's website and branding agency (`docs/design.md`), not part of the Salesforce work.

The other options (Nonprofit Cloud, which Give Lively's app doesn't support, and plain Sales and Service Cloud) no
longer apply to AAFE. Aisling's research on them is in her notes on #213.

## Two ways to get the gala's data into Salesforce

| | CSV file | Automatic sync ("Sync now") |
| --- | --- | --- |
| What it covers | **Who came** (attendees and walk-ins) only | Sponsors, pledges, payments by check, ACH or wire, and guests with their gala-night status |
| How | After the gala, a gala admin downloads the Salesforce file (staff app, Integrations) | The tool sends records straight to Salesforce |
| Import tool | Data Import Wizard, for Contacts and Campaign Members | None: the sync writes directly |
| Setup in Salesforce | The column mapping below | The setup list below |
| Keeps a sign-in | No | Yes (an External Client App) |
| Duplicate risk | Idlewild controls matching in the wizard; see the two rows to leave out | Handled in code (below), once tested in a sandbox |

**Pledges and payments can't go through the Data Import Wizard:** it doesn't import Opportunities. For checks, ACH and
wires there are three options: the NPSP Data Importer (NPSP) or Gift Entry (Nonprofit Cloud) with the Payments report,
Data Loader, or the automatic sync.

## The CSV file: column mapping

The Salesforce file (`salesforceCsv()` in `staff-app/src/exports.ts`, rows from `staff_export_salesforce()`) has one row
per person who came, walk-ins included. Once #214 is merged, its first line is the column names on a real gala (until
then, every download starts with a "synthetic demonstration data" line that the wizard would read as the headers).
A suggested mapping, for Idlewild to confirm against AAFE's fields:

| Column (as downloaded) | Salesforce field (suggested) | Notes |
| --- | --- | --- |
| First Name | Contact: First Name | Empty when the guest's name couldn't be split |
| Last Name | Contact: Last Name | Required by Salesforce; always filled (a walk-in's name as typed) |
| Email | Contact: Email | The match key for existing Contacts; empty for walk-ins |
| Title | Contact: Title | |
| Account Name | Contact: Account Name, or a custom "Organization" field | The guest's organization. Idlewild decides: NPSP keeps people in Household Accounts |
| Sponsor | Campaign Member: a custom "Sponsor" field, or leave out | Who invited the guest |
| Account ID | Account ID (lookup) | Filled only after an automatic sync has run |
| Opportunity ID | Opportunity ID (lookup) | Filled only after an automatic sync has run |
| Guest Type | Campaign Member: a custom "Guest type" field | Sponsor guest, Ticket holder, Guest of AAFE, Government or VIP, AAFE staff, Event volunteer, Event staff, Walk-in |
| Checked In At | Campaign Member: Status = Attended, plus a custom "Arrived at" field | **UTC**, e.g. `2027-05-27T22:31:00+00:00` (6:31 PM in New York) |
| Check-in Method | Leave out, or a custom field | qr, search or exception |

No phones, dietary or accessibility details are in the file.

**Two kinds of rows to leave out or match by hand:** walk-ins and guests without an email. With no email to match on,
the wizard would add them again on every import. The automatic sync already skips guests without an email for the same
reason.

## Automatic sync: setup list for Idlewild

1. **A sandbox first.** Run the sync against a Salesforce sandbox with invented data before AAFE's real org. It has
   only been tested against a stand-in so far.
2. **An External Client App** with the OAuth client credentials flow and a run-as user with access to the objects
   below. (New "connected apps" are restricted since Spring '26; External Client Apps support the same flow.) Its client
   id and secret go into Supabase as `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`, with `SALESFORCE_BASE_URL`
   set to the org's My Domain URL. The tool gets a fresh token each run.
3. **A field `AAFE_Gala_Id__c`** (Text, External ID, Unique) on Campaign, Account, Opportunity, `npe01__OppPayment__c`
   and Contact, so a second sync updates instead of duplicating. (NPSP objects; on Nonprofit Cloud the list changes.)
4. **Campaign Member statuses** Registered, Attended and No Show on the gala's Campaign.
5. **The gala's Campaign:** if Give Lively already made one, put the gala's id (for example `ev-2027`) in its
   `AAFE_Gala_Id__c` once. The tool then always uses that Campaign, whatever its name.

## Decisions for AAFE and Idlewild

| Decision | Setting | Default today |
| --- | --- | --- |
| **Which Salesforce product** AAFE's org is | **Answered Oct 21: NPSP**, with Give Lively's app connected | The code assumes NPSP, so it fits |
| Does NPSP create payment records itself when a pledge is added? If yes, the tool shouldn't, or each check appears twice | `SALESFORCE_SEND_PAYMENTS=false` | The tool sends payments |
| Which guests belong in Salesforce: every named guest, only those who came, or none (donors and sponsors only)? Guests' contact details are deleted from the tool 60 days after the gala, but stay in Salesforce. Decide before the first sync: switching from `all` to `attended` later doesn't remove the guests already sent | `SALESFORCE_SEND_GUESTS=all`, `attended` or `none` | Every named guest |
| Should attendance (Attended, No Show) count in Salesforce? | Part of the above | Sent |
| **Fair market value** on acknowledgments: a ticket or sponsorship over $75 needs it. Give Lively handles that online; the tool has no fair market value per level for checks, ACH and wires | None yet | Not tracked |

## How the sync avoids duplicates

- **People** are matched by email, the way Give Lively matches them (Email and NPSP's Personal, Work and Alternate
  Email). A matched Contact is linked, never overwritten. A guest with **no email is skipped**, not created: by name
  alone it could only be a duplicate. Staff see how many were skipped and can match them by hand.
- **Sponsors** are matched by name to AAFE's existing Accounts. One match: linked, never overwritten. Two or more:
  nothing is made, and the sync says to put the sponsor's id in `AAFE_Gala_Id__c` on the right one.
- **The gala's Campaign** is Give Lively's when it has one; two with the same name and nothing is made.
- **If Salesforce can't be asked** (a lookup fails), nothing is made that run, so nothing can be a duplicate.

## Sources

- [SalesforceBen: the state of Salesforce nonprofit offerings in 2026](https://www.salesforceben.com/the-state-of-salesforce-nonprofit-offerings-in-2026/) (Feb 18, 2026)
- [Give Lively: Salesforce nonprofit integrations](https://www.givelively.org/blog/salesforce-nonprofit-integrations-whats-free-whats-not-what-matters) (Aug 6, 2026)
- [Give Lively: Salesforce integration logic and fields](https://www.givelively.org/resources/see-our-salesforce-integration-logic-and-fields-1-3)
- [Salesforce: fundraising data model](https://developer.salesforce.com/docs/platform/data-models/guide/fundraising.html)
- [Salesforce Help: client credentials flow for External Client Apps](https://help.salesforce.com/s/articleView?language=en_US&id=xcloud.configure_client_credentials_flow_for_external_client_apps.htm&type=5)

Sources found by Aisling Leiva-Davila in her review of #213; confirm with Idlewild Partners. Prototype with invented data only (CLAUDE.md, hard rule 1).
