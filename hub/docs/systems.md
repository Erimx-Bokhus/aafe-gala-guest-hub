# Systems
<!-- reviewed 2026-10-09 Aisling -->

The tools AAFE already uses, and what each means for the build.

| System | What we know | What it means for us |
| --- | --- | --- |
| Give Lively | Free platform; tickets and donations; sends tax receipts | Keep it. Read from it; never replace it |
| aafe.org | WordPress site; AAFE works with GreyBox Creative | Match its look in the prototype |
| Google Workspace | AAFE email and Drive | Staff sign-in later, if adopted (the prototype uses emailed sign-in links); AppSheet may be included <!-- modified 2026-10-08 04:15 Aisling --> |
| Salesforce | Being built; live for the 2027 gala | Provide a clean export; the demo also shows a simulated push to a stand-in, never a real Salesforce org <!-- modified 2026-10-08 04:15 Aisling --> |
| Stripe | Processes Give Lively payments into AAFE's own account | Not connected in the prototype; a future option |
| Mailchimp | Likely used for gala email (from link tracking) | Confirm with AAFE |
| Auctria | Ran the 2026 online auction | Out of scope |

## Give Lively

- **No public API.** The documented ways out are a CSV report from the admin portal and a read-only JSON donation feed that turns on when an admin creates a Zapier key. The feed can be asked for "everything changed since" a time.
- **AAFE's ticket export is one row per purchase**, with the tier and ticket count, but guests' names sit in one free-text answer. <!-- modified 2026-10-06 06:12 Aisling -->
- **Custom-question answers** are not in the main report.
- **No comps.** Give Lively's own help center says event ticketing doesn't support complimentary tickets; the workaround is a hidden page where staff enter each guest by hand.
- **Sponsors can't edit guest names** after adding them, and questions can't vary by package.
- **Payments** run through Stripe into AAFE's own account, and each line in the report carries the Stripe charge ID.

## aafe.org and its web partner

- **AAFE works with GreyBox Creative**, a New York branding and web agency, for its website and brand. GreyBox lists AAFE's rebrand and trilingual website in its portfolio. <!-- updated 2026-10-08 04:15 Aisling -->
- **The site** is WordPress with a custom theme, Poppins type, and AAFE's orange-red brand color. The prototype matches that look.
- **If AAFE adopts the tool,** it confirms who administers its domain, DNS, hosting, WordPress, and maintenance accounts before choosing a production host or a custom address like guests.aafe.org, and may request a scoped quote from its web partner.

## Stripe

Give Lively already sends payments to AAFE's Stripe account. The prototype does not connect to it; these are options a future version could add:

- **Read-only confirmation:** a restricted key confirms Give Lively payments and flags refunds or disputes, storing only the charge ID, amount, date, and status.
- **Stripe invoices for emailed pledges (AAFE's decision):** sponsors could pay online by bank transfer at 0.8% capped at $5, plus 0.4% capped at $2 per invoice. Stripe invoices don't send tax receipts. How AAFE acknowledges gifts paid outside Give Lively (checks, ACH) isn't confirmed: it wasn't discussed on the October 1 call, so it's on the Discovery page's questions. <!-- modified 2026-10-07 00:11 Aisling Was stated as fact; not confirmed by AAFE -->
