# Data and AI
<!-- reviewed 2026-10-09 Aisling -->

The prototype uses invented data only. This page sets out what a production version would store and how it would treat AI, so AAFE can review it with its AI policy; the policies themselves are AAFE's decisions.

1. **No payment processing.** Payments stay in Give Lively and Stripe. The tool never stores card or bank details, and the prototype does not connect to Stripe.
2. **No real donor data during the capstone.** Everything through Demo Day uses invented names.
3. **No AI in the first version** (proposed Oct 7; AAFE confirms). If AAFE wants AI later, it is optional and supervised: it sees the fewest fields possible, and a staff member approves everything before it reaches a sponsor. <!-- modified 2026-10-07 22:38 Aisling -->
4. **AAFE decides retention.** Our proposal: export for Salesforce after the gala, then delete guest contact details within 60 days, dietary and accessibility details included. <!-- modified 2026-10-07 22:38 Aisling -->

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

**Optional, if AAFE chooses:** dietary and accessibility needs, shown only to staff who need them and deleted within 60 days after the gala with the other contact details (our proposal). <!-- modified 2026-10-08 04:15 Aisling -->

## AI ideas for later (not in the first version)
<!-- modified 2026-10-08 04:15 Aisling -->

- **Matching works without AI, and the first version has none** (proposed to AAFE Oct 7). <!-- modified 2026-10-08 04:15 Aisling -->
- **What AI would never receive:** email addresses, phone numbers, or payment information.
- **Provider terms:** a paid service that doesn't train on submitted data, confirmed in writing before any real data is used.

If AAFE wants AI later, these ideas fit the rules above (off by default, staff approve everything, no emails, phone numbers, or payment details sent to AI): <!-- modified 2026-10-09 06:10 Aisling Demo Day note moved to a team section -->

1. **Split the free-text guest list** from Give Lively into names; emails are removed before the text goes to AI, and staff confirm the result. (Today plain rules do this without AI.) <!-- modified 2026-10-07 23:27 Aisling -->
2. **Flag likely badge errors**, such as a title or organization that differs from earlier records, for the relationship owner to review. <!-- new 2026-10-05 16:51 Aisling -->
3. **Explain why two records may be the same person** in the review queue. <!-- new 2026-10-05 16:51 Aisling -->
4. **Draft follow-up emails** for staff to edit and approve. <!-- new 2026-10-05 16:51 Aisling -->

## Demo Day and AI
<!-- team -->
<!-- new 2026-10-09 06:10 Aisling Moved from the AI ideas section -->

Antonin flagged on Oct 3 that AI Native Demo Day may expect two or three real AI features. The proposal to AAFE is still none in the first version (Oct 7); the ideas above are the candidates if that changes, and the risk is on [Risks](#risks.team-risks).

## Access

- Staff sign in with an emailed link (demo accounts when no keys are set); three roles: gala admin, relationship manager, and check-in volunteer. A production version would use AAFE's Google accounts with MFA. <!-- modified 2026-10-08 04:15 Aisling -->
- Sponsors can see their own guests' gala-night arrivals: arrived or not, never a time. It's built switched off until AAFE approves it. <!-- modified 2026-10-07 22:38 Aisling -->
- Keys: only the project address and the public anon key ever go in an app. Keys that can bypass the access rules stay in Supabase's encrypted secret store; the build refuses to ship one to the browser. Details: `docs/keys-and-secrets.md`. <!-- updated 2026-10-06 20:56 Aisling -->
- Sponsor links open only that sponsor's purchase and stop working after AAFE's deadline day. QR e-tickets open only one seat and expire after gala night. Both are random, and only a scrambled (hashed) copy is stored, so a database leak doesn't reveal working links. <!-- modified 2026-10-03 11:56 Aisling -->
- Every email is approved by staff before it sends. A relationship manager who reviews and sends their own comp ticket counts as the approver; every send is logged. <!-- modified 2026-10-03 11:56 Aisling -->
- Every edit records who made it and when.
- Data is encrypted in transit and at rest; credentials live in the host's secrets store, never in the code.

## Decisions for AAFE, if the tool is adopted

- [ ] Confirm: no AI in the first version (our proposal) <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] Delete contact details, dietary and accessibility details included, 60 days after the gala (our proposal), or keep them <!-- modified 2026-10-07 22:38 Aisling -->
- [ ] Collect dietary needs in the tool, or not
- [ ] Who holds admin access
- [ ] Share AAFE's AI acceptable-use policy with the team

Full draft for AAFE: [Guest data and AI handling](https://claude.ai/code/artifact/1d0571f4-d854-4e4a-90df-b60a62de28ce).
