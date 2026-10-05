# AAFE materials received Oct 5, 2026

AAFE's project contact sent the guest-list notes, the 2026 sponsorship flyer, a Give Lively ticket export, and a redacted sponsor email thread. **The files themselves stay out of the repo** (they contain real people's names and emails; hard rule 1). This page records only their structure and the facts the build needs.

## 2026 guest list, by category

553 guests in 2026; 208 had a guaranteed (assigned) table, the rest did not.

| Category | Guests |
| --- | --- |
| Sponsor guests | 234 |
| Comped | 109 |
| Ticket holders | 107 |
| Government or VIP | 53 |
| AAFE staff | 45 |
| Event volunteers | 3 |
| Event staff | 2 |

## 2026 sponsorship tiers

Seat counts per tier are recorded in `docs/decisions.md` (Oct 5). Champion and above come with guaranteed seating; Friend ($2,500, 2 guests) and Supporter ($1,000, 1 guest) are admittance only; full-page ($1,000) and half-page ($500) ads include no ticket. Higher tiers also carry logo placement, ad size, and recognition benefits.

## Deadlines (2026)

| What | Date |
| --- | --- |
| Logo and ad from sponsors | April 30 |
| Guest names from sponsors | May 11 |
| Gala | May 21 |

## AAFE's spreadsheet today

Two tabs.

**Prospect tracker** (every sponsor prospect): donor (organization), contact first name and surname, relationship manager, sector (AAFE board, community, corporate, foundation, individual, small business), email, optional address, status as a pipeline stage (0% not initiated, 10% reached out, 50% in conversation, 90% closed won, 100% payment received, 0% closed lost), prior two years' sponsorship $, current ask $, commitment $, sponsor level, sponsor follow-up contact (an AAFE person different from the relationship manager), add-ons (ads), number of tickets, payment type (check, ACH, Stripe, etc.), date payment received, and requested/received status for guest list, logo, and ad.

**Confirmed attendee list** (also used for check-in): full name, email, organization, relationship manager, sponsorship tier, seated (Y/N), category (above), name tag printed (checkbox), internal notes.

## Give Lively ticket export

One row **per purchase**, not per ticket. Columns: first name, last name, email, tier purchased, tier category, tickets purchased, total seats, amount spent, amount refunded, transaction fee covered, date/time of purchase, referrer URL, payment method, status, UTM source, page name, internal name, client application name, Double the Donation flag, company/organization, phone, **one free-text question holding every guest's name and email** ("Please list the name(s) and email address(es) of all guests…"), and address fields.

What this changes for the import spec (`docs/import-matching-spec.md`):
- **No transaction ID and no per-ticket ID.** A purchase is identified by purchaser email + purchase date/time + tier.
- **Guest names arrive as free text** in one cell, in whatever format the buyer typed. They must be split into names and emails, with anything unclear sent to staff review.
- **Refunds are a column** (amount refunded) and status is a column, so refunds can be read directly.

## How sponsor communication works today

From the redacted thread: a sponsor is invited by email with a tier and amount; they reply choosing a tier and ask for an invoice; AAFE sends the invoice, W-9, and wire/check/ACH options; staff follow up separately on payment, logo and ad (due April 30), and guest names (due May 11); accounting confirms payment by email; guests are swapped up to the morning of the gala, and late swaps get a hand-written blank name tag at check-in. Each step is the follow-up the tool should track.
