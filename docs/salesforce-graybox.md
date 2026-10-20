# Salesforce: setup and decisions for AAFE and Graybox

For the technical meeting with Graybox, AAFE's Salesforce firm (requested by AAFE's gala lead at the Oct 19 midpoint
check-in). It lists what the gala tool can send to Salesforce, what Graybox would set up, and the decisions that are
AAFE's and Graybox's to make. Code: `prototype/supabase/functions/_shared/salesforce.ts`; technical detail:
`prototype/docs/BACKEND.md` ("Demo with a stand-in Salesforce").

## Two ways to get the gala's data into Salesforce

| | CSV file (recommended first) | Automatic sync ("Sync now") |
| --- | --- | --- |
| How | After the gala, a gala admin downloads the Salesforce file (staff app, Integrations); AAFE imports it with Salesforce's Data Import Wizard | The tool sends sponsors, pledges, payments and guests straight to Salesforce |
| Setup in Salesforce | None beyond the field mapping below | The setup list below |
| Keeps a sign-in | No | Yes (a connected app) |
| Duplicate risk | Graybox controls matching in the wizard | Handled in code (below), once tested in a sandbox |

Give Lively's own Salesforce connector keeps sending online purchases either way: the buyer as a Contact, the donation
as an Opportunity, and the event's Campaign. The tool sends only what Give Lively doesn't know.

## The CSV file: column mapping

`staff_export_salesforce()`: one row per person who came (walk-ins included). A suggested mapping for the Data Import
Wizard, for Graybox to confirm against AAFE's fields:

| Column | Salesforce field (suggested) | Notes |
| --- | --- | --- |
| `first_name` | Contact: First Name | Empty when the guest's name couldn't be split |
| `last_name` | Contact: Last Name | Required by Salesforce; always filled |
| `email` | Contact: Email | The match key for existing Contacts; empty for walk-ins |
| `title` | Contact: Title | |
| `organization` | Contact: Account Name, or a custom "Organization" field | Graybox decides: NPSP usually keeps people in Household Accounts |
| `sponsor` | Campaign Member: a custom "Sponsor" field, or leave out | Who invited the guest |
| `salesforce_account_id` | Account ID (lookup) | Filled only after an automatic sync has run |
| `salesforce_opportunity_id` | Opportunity ID (lookup) | Filled only after an automatic sync has run |
| `guest_type` | Campaign Member: a custom "Guest type" field | sponsor guest, ticket holder, comp, walk-in |
| `checked_in_at` | Campaign Member: Status = Attended, plus a custom "Arrived at" field | New York time |
| `check_in_method` | Leave out, or a custom field | qr, search or exception |

No phones, dietary or accessibility details are in the file.

## Automatic sync: setup list for Graybox

1. **A sandbox first.** Run the sync against a Salesforce sandbox with invented data before AAFE's real org. It has
   only been tested against a stand-in so far.
2. **A connected app** with the OAuth client credentials flow and a run-as user with access to the objects below. Its
   client id and secret go into Supabase as `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`, with
   `SALESFORCE_BASE_URL` set to the org's My Domain URL. The tool gets a fresh token each run.
3. **A field `AAFE_Gala_Id__c`** (Text, External ID, Unique) on Campaign, Account, Opportunity, `npe01__OppPayment__c`
   and Contact, so a second sync updates instead of duplicating.
4. **Campaign Member statuses** Registered, Attended and No Show on the gala's Campaign.
5. **The gala's Campaign:** if Give Lively already made one, put the gala's id (for example `ev-2027`) in its
   `AAFE_Gala_Id__c` once. The tool then always uses that Campaign, whatever its name.

## Decisions for AAFE and Graybox

| Decision | Setting | Default today |
| --- | --- | --- |
| Does NPSP create payment records itself when a pledge is added? If yes, the tool shouldn't, or each check appears twice | `SALESFORCE_SEND_PAYMENTS=false` | The tool sends payments |
| Which guests belong in Salesforce: every named guest, only those who came, or none (donors and sponsors only)? Guests' contact details are deleted from the tool 60 days after the gala, but stay in Salesforce | `SALESFORCE_SEND_GUESTS=all`, `attended` or `none` | Every named guest |
| Should attendance (Attended, No Show) count in Salesforce? | Part of the above | Sent |

## How the sync avoids duplicates

- **People** are matched by email, the way Give Lively matches them (Email and NPSP's Personal, Work and Alternate
  Email). A matched Contact is linked, never overwritten. A guest with **no email is skipped**, not created: by name
  alone it could only be a duplicate. Staff see how many were skipped and can match them by hand.
- **Sponsors** are matched by name to AAFE's existing Accounts. One match: linked, never overwritten. Two or more:
  nothing is made, and the sync says to put the sponsor's id in `AAFE_Gala_Id__c` on the right one.
- **The gala's Campaign** is Give Lively's when it has one; two with the same name and nothing is made.
- **If Salesforce can't be asked** (a lookup fails), nothing is made that run, so nothing can be a duplicate.

Prototype with invented data only (CLAUDE.md, hard rule 1).
