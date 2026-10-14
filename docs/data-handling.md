# Guest data and AI handling (draft for AAFE)

Live, reviewable version: https://claude.ai/code/artifact/1d0571f4-d854-4e4a-90df-b60a62de28ce
This file mirrors its commitments so the code can be checked against them.

## Commitments
1. No payment processing: no Stripe integration; no card, bank, or ACH details. Payments are recorded as method, date, status, and amount.
2. No real donor data during the capstone; synthetic data through Demo Day (Nov 10).
3. Proposed for the first version: no AI features (AAFE confirms). If AAFE wants AI later, it is optional and supervised: minimum fields, no emails/phones/payment info sent to AI, staff approve everything, one admin switch turns AI off. Use a paid provider whose terms exclude training on submitted data; confirm terms in writing before go-live.
4. AAFE decides retention. Proposed default: Salesforce-ready attendee export after the gala, then delete guest contact details within 60 days (backups too). **Dietary and accessibility details are kept from year to year** (AAFE, Oct 14): staff-only, never sent to Salesforce or to AI tools.

## Stores
Purchaser/sponsor contact; attendee name, title, organization, optional email; package and seats; payment method/date/status label; relationship owner; logo/program status; table number, badge status, check-in time; source of each record; change history. Dietary and accessibility needs: staff-only, kept from year to year (AAFE, Oct 14); door lists show only a yes/no accessibility flag.

## Never stores
Card numbers, bank/ACH details, check images, Stripe or Give Lively credentials, sponsor passwords.

## Access
Google sign-in for staff; roles admin / staff / check-in; sponsor links private, scoped to one purchase, expire at AAFE's deadline; audit log of every edit; encryption in transit and at rest; secrets in the host's secrets store.

## Open decisions for AAFE
AI on/off; retention window for contact details; admins; share AI acceptable-use policy; production host and technical partner (after Demo Day).
