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

- **The automatic sync is written for NPSP:** Opportunities, `npe01__OppPayment__c` and NPSP's email fields. It reuses
  Give Lively's Campaign for the gala and matches people by email the way Give Lively does. **Checked Oct 24 against
  Idlewild and NPSP** ("Checked against Idlewild and NPSP" below): four gaps to fix whatever Idlewild answers (payments
  could count twice, the tool renames Give Lively's Campaign, member statuses, refusal reasons), and settings that wait
  on Idlewild's answers (record types, picklist values, Lead Source, required fields).
- **Still to confirm with Idlewild:** the questions in "Questions for Idlewild Partners"
  (https://claude.ai/artifact/7PuS3YtyCyQtD5kfWLGEsS), which guests belong in Salesforce, and the setup list below.
- **Greybox Creative** is AAFE's website and branding agency (`docs/design.md`), not part of the Salesforce work.

Salesforce's Nonprofit Cloud, which Give Lively's app doesn't support, doesn't apply to AAFE. Aisling's research on the
options is in her notes on #213.

## Next: Idlewild is moving AAFE to its Nonprofit Accelerator (Nov 2)

On the Nov 2, 2026 call with AAFE and Idlewild, asked whether AAFE is "staying on NPSP or moving on to your
accelerator", Idlewild's consultant answered: "Moving on to the accelerator, so it's built on just standard sales
cloud." So NPSP is where AAFE's org started (Oct 21, above), and **Idlewild's Nonprofit Accelerator is where it is
going**. As Idlewild described it on the call:
- its own Payments object: an Opportunity gets a Payment automatically unless a "don't create payments" box is ticked,
  and marking the Opportunity paid marks the Payment paid;
- Accounts are "Standard" (organizations) or Household; Contacts have no record types; Opportunities likely use a
  "Special Events" record type;
- everything for a gala goes in that year's Campaign.

The same day, AAFE (AAFE's gala lead) chose to bring the gala's data in as a CSV import for now, not a direct sync.

What this means for the tool:
- **The sync and the CSV files use NPSP's field names** (`npe01__…` and NPSP's email fields). The Accelerator is
  unmanaged, so its fields carry no package prefix. Before going live on it, map each column to the Accelerator's field
  from Idlewild's data diagram (ERD).
- **Give Lively keeps working.** Its Salesforce app runs with or without NPSP (its sync logic checks whether NPSP is
  installed), and Idlewild has shown the Accelerator running with Give Lively. Only Nonprofit Cloud is unsupported.
- **To confirm with Idlewild:** whether NPSP is live in AAFE's org today and when the move happens (the same org or a
  new one); the API names of the Payments object and its fields; the record-type names; which import tool staff will
  use; and the ERD.

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
4. **Campaign Member statuses** Registered, Attended and No Show on the gala's Campaign. Since #250 the sync adds any
   that are missing before it adds members, with the access in step 6. Without that access, add them by hand.
5. **The gala's Campaign:** if Give Lively already made one, the sync finds it by the Give Lively page's name (the
   "Event - …" child Campaign when Give Lively's campaign hierarchy is on), puts the gala's id (for example `ev-2027`)
   in its `AAFE_Gala_Id__c` once and uses it from then on. Since #250 it never renames or changes a Campaign it found.
   Put the id in by hand only when two Campaigns share the name: the sync then makes nothing and says so.
6. **The sync user's access:** read and write on Contact, Account, Opportunity, `npe01__OppPayment__c`, Campaign and
   Campaign Member; field access to `AAFE_Gala_Id__c` on all five, NPSP's Home, Work and Alternate email fields and
   `npo02__NumberOfClosedOpps__c`; and the Marketing User setting if Campaigns need it. One hidden field makes a whole
   lookup fail. Two more since #250 (Cornell's review):
   - **write access to `npe01__Do_Not_Automatically_Create_Payment__c`** on Opportunity. The sync sets it on every
     Opportunity when it sends payments (the default). Without the access, Salesforce refuses every Opportunity, not
     only the payments.
   - **create on Campaign Member Status**, for step 4.
7. **Rules that can refuse a record:** if Idlewild exempts Give Lively from duplicate and validation rules by Lead
   Source, the tool needs a Lead Source of its own (never "Give Lively") and the same exemption.

## Decisions for AAFE and Idlewild

| Decision | Setting | Default today |
| --- | --- | --- |
| **Which Salesforce product** AAFE's org is | **Answered Oct 21: NPSP**, with Give Lively's app connected | The code assumes NPSP, so it fits |
| Does NPSP create payment records itself when a pledge is added? If yes, the tool shouldn't, or each check appears twice | Since #250: the tool marks its Opportunities "don't create a payment automatically", so its own payments are the only ones. `SALESFORCE_SEND_PAYMENTS=false` also stops the double, but loses each payment's method, date and part payments | The tool sends payments and sets the flag on each Opportunity |
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

## Checked against Idlewild and NPSP (Oct 24)

Aisling's review of Idlewild Partners and of how NPSP and Give Lively's app behave, checked line by line against the
sync on `main` (`f88db6c`). The questions for the technical meeting are in "Questions for Idlewild Partners"
(https://claude.ai/artifact/7PuS3YtyCyQtD5kfWLGEsS).

**Who Idlewild is.** A Brooklyn Salesforce consultancy for nonprofits, founded in 2015, about 23 people, with 30 days
of support after go-live ([who we are](https://www.idlewildinc.com/who-we-are),
[what we do](https://www.idlewildinc.com/what-we-do)). They also sell their own **Nonprofit Accelerator**, built on
plain Sales Cloud, and offer to move NPSP orgs onto it
([Nonprofit Accelerator](https://www.idlewildinc.com/nonprofit-accelerator)). The sync depends on NPSP's managed
packages (`npe01`, `npo02`); Idlewild is moving AAFE onto the Accelerator, so its fields are mapped first ("Next:
Idlewild is moving AAFE to its Nonprofit Accelerator", above).

**What the sync writes today** (`prototype/supabase/functions/_shared/salesforce.ts`): a Campaign (found by our id or
the Give Lively page's name), Accounts (found by exact name), Opportunities, `npe01__OppPayment__c` payments, Contacts
(found on Email and NPSP's Home, Work and Alternate emails; made only when none match) and Campaign Members. It never
sends a record type, a Lead Source, a primary contact or GAU allocations, and no duplicate-rule header.

**Since this check:** the first four risks below are fixed (payments, the Campaign and member statuses in #250;
refusals in #252), and Cornell's review of #250 added two permissions to setup step 6. The table shows the code as it
was checked.

| Risk | What the code does now | Real gap? | Fix | Size | Waits on Idlewild |
| --- | --- | --- | --- | --- | --- |
| Payments counted twice | Creates the Opportunity with no "don't create a payment" flag, then adds its own paid payment | Yes, if NPSP's automatic payments are on | Set `npe01__Do_Not_Automatically_Create_Payment__c` on the tool's Opportunities. Right either way, and keeps each payment's method and date (`SALESFORCE_SEND_PAYMENTS=false` would lose them) | Tiny | No |
| The tool renames Give Lively's Campaign | A Campaign carrying our id gets its Name, Start Date, Type and Active overwritten every sync | Yes: setup step 5 tells Idlewild to put our id on Give Lively's Campaign | Use a found Campaign as it is; write only one the tool created | Tiny | No |
| Member statuses missing | Sends Registered, Attended, No Show; never adds them to the Campaign | Yes, every new Campaign (Salesforce starts with Sent, Responded) | Add the three statuses to the gala's Campaign before adding members | Small | No |
| Refusals look like "try later" | Salesforce's reason is dropped ("HTTP 400"); staff see only a count | Yes | Keep Salesforce's error code and message; show failed records and the first reason on Integrations | Small | No |
| No record type | Accounts and Opportunities get the sync user's default | Depends: under NPSP that's often Household Account | Two settings with record type names, looked up each run | Small | Yes |
| Stage and Payment Method values | Pledged, Closed Won, Closed Lost; Check, ACH, Wire | Depends on AAFE's picklists; Give Lively uses "Posted" | Change the mapping | Tiny | Yes |
| Duplicate and validation rules | No Lead Source, no header: every rule applies | Depends on Idlewild's rules | A Lead Source of the tool's own (never "Give Lively") for exemptions | Tiny | Yes |
| Required fields, GAU allocations, primary contact | Not sent | Depends | Per Idlewild's answers | Depends | Yes |
| Close Date | The order's created date, even when paid | Small: NPSP's gift-date reports use it | Last payment's date for paid sponsorships | Tiny | Confirm |
| Sync user access | Any hidden field makes a whole lookup fail | Gap in the setup list | Setup steps 6 and 7 above | Tiny | Idlewild does it |

**If NPSP isn't there, or fields are hidden:** the Campaign, Accounts and Opportunities still go through, but every
Contact lookup and payment fails, so AAFE would get Opportunities with no payments and no guests. Without
`AAFE_Gala_Id__c`, nothing is made. Since #252, staff see how many records weren't sent, Salesforce's reason and what
to do, on the Integrations page.

**Our tests can't catch these.** The stand-in Salesforce (`database/demo_salesforce.sql`) accepts any field or value.
Only a sandbox run shows AAFE's picklists, record types, rules and NPSP's automation (setup step 1).

**To confirm in the sandbox:** whether NPSP's automatic payments are on and marked paid; what Salesforce does with a
member status the Campaign doesn't have; whether Payment Method is a restricted picklist; whether "Event" is a Campaign
Type; whether Give Lively finds its Campaign by name or by id; whether Campaign access needs the Marketing User setting.

## Sources

- [SalesforceBen: the state of Salesforce nonprofit offerings in 2026](https://www.salesforceben.com/the-state-of-salesforce-nonprofit-offerings-in-2026/) (Feb 18, 2026)
- [Give Lively: Salesforce nonprofit integrations](https://www.givelively.org/blog/salesforce-nonprofit-integrations-whats-free-whats-not-what-matters) (Aug 6, 2026)
- [Give Lively: Salesforce integration logic and fields](https://www.givelively.org/resources/see-our-salesforce-integration-logic-and-fields-1-3)
- [Salesforce: fundraising data model](https://developer.salesforce.com/docs/platform/data-models/guide/fundraising.html)
- [Idlewild Partners: who we are](https://www.idlewildinc.com/who-we-are), [what we do](https://www.idlewildinc.com/what-we-do), [Nonprofit Accelerator](https://www.idlewildinc.com/nonprofit-accelerator) (read Oct 24, 2026)
- [Trailhead: create or edit NPSP payments](https://trailhead.salesforce.com/content/learn/modules/donation-management-basics-with-nonprofit-success-pack/create-or-edit-payments)
- [Give Lively: exempt its records from duplicate rules](https://www.givelively.org/resources/exempt-give-lively-data-syncing-from-salesforce-duplicate-rules)
- [Give Lively: campaign mapping](https://intercom.help/give-lively/en/articles/16239466-configure-campaign-mapping-in-give-lively-s-salesforce-integration)
- [Salesforce Help: client credentials flow for External Client Apps](https://help.salesforce.com/s/articleView?language=en_US&id=xcloud.configure_client_credentials_flow_for_external_client_apps.htm&type=5)

Sources found by Aisling Leiva-Davila in her review of #213; confirm with Idlewild Partners. Prototype with invented data only (CLAUDE.md, hard rule 1).
