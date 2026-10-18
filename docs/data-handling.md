# Guest data and AI handling (draft for AAFE)

Live, reviewable version: https://claude.ai/code/artifact/1d0571f4-d854-4e4a-90df-b60a62de28ce
This file mirrors its commitments so the code can be checked against them.

## Commitments
1. No payment processing: no Stripe integration; no card, bank, or ACH details. Payments are recorded as method, date, status, and amount.
2. No real donor data during the capstone; synthetic data through Demo Day (Nov 10).
3. Proposed for the first version: no AI features (AAFE confirms). If AAFE wants AI later, it is optional and supervised: minimum fields, no emails/phones/payment info sent to AI, staff approve everything, one admin switch turns AI off. Use a paid provider whose terms exclude training on submitted data; confirm terms in writing before go-live.
4. AAFE decides retention. Proposed default: Salesforce-ready attendee export after the gala, then delete guest contact details within 60 days (backups too), dietary and accessibility details included. Dietary and accessibility answers are **not** kept from year to year (decided Oct 18, `decisions.md`): each guest's answers are deleted after the gala, and AAFE keeps only that gala's totals (how many guests chose each option, for example 42 vegan, 3 wheelchair access), with no names attached. Until then only AAFE staff and the sponsor contact who entered them (through their private link) see them, and they are never sent to Salesforce or to AI tools. **Built (Oct 18, #194):** after the gala, a gala admin saves the totals and deletes every guest's answers, and their old values in the change log, once (`staff_clear_needs`; the staff app's button is still to come). **Not built yet:** deleting guests' contact details within 60 days, once AAFE confirms the window (security review, Gate 2).

## Stores
Purchaser/sponsor contact; attendee name, title, organization, email (optional or required: the team's decision, written in `decisions.md`; the sponsor portal asks for it today); package and seats; payment method/date/status label, and for checks the check number; relationship owner; logo/program status; table number, badge status, check-in time; source of each record; change history (the app shows its summaries; old values stay in the database for the record, except food and access answers, which are cleared with the answers after the gala). Give Lively's own records of this gala's purchases, without phone numbers or postal addresses. Optional (AAFE's choice): dietary/accessibility needs, deleted after the gala with only that gala's totals kept (decided Oct 18, `decisions.md`); door lists show only a yes/no accessibility flag. The check-in iPad keeps the door list (names, titles, organizations, tables, the yes/no flag) until someone signs out or the gala closes.

## Never stores
Card numbers, bank/ACH details, check images, Stripe or Give Lively credentials, sponsor passwords.

## Access
Staff sign in with a one-time code or link emailed to their AAFE staff address; roles gala admin / relationship manager / check-in volunteer. Relationship managers see guests' emails and food and access details for the gala being run only; gala admins see every year, and Give Lively's raw records. Sponsor links and QR e-tickets are random, stored only as a fingerprint (hash), scoped to one purchase or one seat, and expire (links at AAFE's deadline, QR codes after gala night); audit log of every edit; encryption in transit and at rest; secrets in the host's secrets store. Services that receive data: Supabase (database and sign-in), Cloudflare (the apps), Resend (emails: the recipient's name and address and the email's text, which carries the private link or QR code), and, if AAFE connects it, Salesforce (a gala admin sends guests' names, emails and attendance status; never phones, food or access details). Downloaded reports are copies the tool can't delete: files with guests' emails or food and access details (Who came, Full guest list: gala admins only) belong in AAFE's own drive, not on a shared iPad, and are deleted under the same retention rule.

## Open decisions for AAFE
AI on/off; retention window for contact details; admins; share AI acceptable-use policy; production host and technical partner (after Demo Day).
