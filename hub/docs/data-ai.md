# Data and AI
<!-- reviewed 2026-10-06 Aisling -->

The prototype uses invented data only. This page sets out what a production version would store and how it would treat AI, so AAFE can review it with its AI policy; the policies themselves are AAFE's decisions.

1. **No payment processing.** Payments stay in Give Lively and Stripe. The tool never stores card or bank details, and the prototype does not connect to Stripe.
2. **No real donor data during the capstone.** Everything through Demo Day uses invented names.
3. **AI is optional and supervised.** It sees the fewest fields possible, and a staff member approves everything before it reaches a sponsor.
4. **AAFE decides retention.** Guest data can be exported for Salesforce and deleted after the gala.

## What the tool stores

| Stores | Never stores |
| --- | --- |
| Purchaser or sponsor contact: name, title, organization, email, phone | Card numbers, bank or ACH details, check images |
| Attendee name, title, organization, optional email | Stripe or Give Lively logins |
| Package and seat count | Sponsor passwords (they use private links) |
| Payment method, date, and status | |
| Relationship owner, logo and program-ad status | |
| Table number, badge status, check-in time | |
| Source of each record (Give Lively, staff entry, sponsor link, or check-in desk) and a history of every change | <!-- modified 2026-10-03 11:56 Aisling --> |

**Optional, if AAFE chooses:** dietary and accessibility needs, shown only to staff who need them and deleted after the event.

## AI

- **Where it could help:** drafting follow-up emails, and explaining why two records look like the same person.
- **What it never receives:** email addresses, phone numbers, or payment information.
- **Matching works without AI.** The rules are plain and auditable; AI explanations sit behind an admin switch, off by default.
- **Provider terms:** a paid service that doesn't train on submitted data, confirmed in writing before any real data is used.

## AI features for Demo Day
<!-- new 2026-10-05 16:51 Aisling -->

Antonin flagged on Oct 3 that AI Native Demo Day may expect two or three real AI features; the team is confirming whether that is required. Candidates that fit the rules above (off by default, staff approve everything, no emails, phone numbers, or payment details sent to AI): <!-- new 2026-10-05 16:51 Aisling -->

1. **Split the free-text guest list** from Give Lively into names; emails are removed before the text goes to AI, and staff confirm the result. <!-- new 2026-10-05 16:51 Aisling -->
2. **Flag likely badge errors**, such as a title or organization that differs from earlier records, for the relationship owner to review. <!-- new 2026-10-05 16:51 Aisling -->
3. **Explain why two records may be the same person** in the review queue. <!-- new 2026-10-05 16:51 Aisling -->
4. **Draft follow-up emails** for staff to edit and approve. <!-- new 2026-10-05 16:51 Aisling -->

## Access

- The prototype uses demo accounts with three roles: gala admin, relationship manager, and check-in volunteer. A production version would use AAFE's Google accounts with MFA. <!-- modified 2026-10-06 05:50 Aisling -->
- Sponsor links open only that sponsor's purchase and expire at AAFE's deadline. QR e-tickets open only one seat and expire after gala night. Both are random, and only a scrambled (hashed) copy is stored, so a database leak doesn't reveal working links. <!-- modified 2026-10-03 11:56 Aisling -->
- Every email is approved by staff before it sends. A relationship manager who reviews and sends their own comp ticket counts as the approver; every send is logged. <!-- modified 2026-10-03 11:56 Aisling -->
- Every edit records who made it and when.
- Data is encrypted in transit and at rest; credentials live in the host's secrets store, never in the code.

## Decisions for AAFE, if the tool is adopted

- [ ] AI on or off
- [ ] Delete contact details 60 days after the gala, or keep them
- [ ] Collect dietary needs in the tool, or not
- [ ] Who holds admin access
- [ ] Share AAFE's AI acceptable-use policy with the team

Full draft for AAFE: [Guest data and AI handling](https://claude.ai/code/artifact/1d0571f4-d854-4e4a-90df-b60a62de28ce).
