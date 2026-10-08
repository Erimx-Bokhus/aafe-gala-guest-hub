# Research
<!-- reviewed 2026-10-08 Aisling -->

What already exists, what it costs, and why we are building a companion to Give Lively rather than replacing it. Market research by Natalie Walker (Source of Truth v3, §13); prices collected September 29, 2026 from vendor pages and third-party listings. Several vendors quote privately and prices change often, so confirm before quoting any figure to AAFE.

## The short version

The market has solved seats, sponsor guest links, and check-in, but only by replacing Give Lively. Paid gala platforms earn subscription and transaction fees on the whole event, so none has a reason to build a free add-on for a free platform. **The gap is an integration gap, not a missing feature:** no product connects Give Lively sales, checks, direct deposits, and comps into one seat-by-seat guest list.

## What each option costs a year

```costbars
title: Yearly platform cost to AAFE, log scale
scale: log 100 30000
Give Lively + spreadsheet (today) | 0 | 0 | today | No platform fee; card processing fees only
Our companion tool, if adopted | 160 | 1500 | ours | Estimated base hosting of about $160, up to about $1,500 counting support time (illustrative)
GalaBid | 0 | 0 | gala | Free, funded by donor tips; replaces Give Lively checkout
ClickBid | 895 | 1495 | gala | Essentials to Full Suite
RSVPify | 1068 | 1068 | gala | Plus plan, billed annually
OneCause | 2995 | 2995 | gala | Annual package
GiveSmart | 3000 | 3000 | gala | Listed around $3,000, by quote
Cvent | 5000 | 25000 | enterprise | Typical for small organizations, plus per-registrant fees
Swoogo | 11800 | 11800 | enterprise | Professional plan; AAFE's 2024 gala site
Bizzabo | 17999 | 17999 | enterprise | Plus about $3,000–$30,000 implementation
```

Platform fees only; payment processing is extra everywhere. Each step on the scale is about three times the last. The tool only makes sense below the mid-priced gala tools, and only with a named owner.

```notes
Swoogo at $11,800 a year is the likely "too expensive" reference from the intake form. Everything below $1,500 either replaces Give Lively or is us.
```

## Enterprise event platforms

| Platform | Yearly cost | Fit for AAFE |
| --- | --- | --- |
| Swoogo | $11,800 (Professional); Enterprise by quote | Used for AAFE's 2024 50th Anniversary Gala site. Built for organizations running many events |
| Bizzabo | From $17,999 (three-user minimum), plus implementation | Conference-focused; badging quoted per event |
| Cvent | Not published; small organizations commonly $5,000–$25,000, plus per-registrant fees | Enterprise registration and onsite check-in |

## Nonprofit gala platforms

| Platform | Cost | Fit for AAFE |
| --- | --- | --- |
| OneCause | About $2,995 a year, or pay-as-you-go from about $200 | Strong gala fit; replaces Give Lively |
| GiveSmart | Around $3,000 a year by quote, or pay-as-you-go | Strong gala fit; replaces Give Lively |
| ClickBid | $895–$1,495 a year | Full toolkit at a modest price; replaces Give Lively checkout |
| RSVPify | About $1,068 a year (Plus), or per-ticket fees | Closest match to the sponsor guest-name problem: table captains manage their own guests |
| GalaBid | Free (donor-tip funded) | Table purchasers manage their own guests; Stripe only; replaces Give Lively checkout |
| Give Lively (today) | No platform fee; processing fees only | AAFE's existing system |

## Open-source platforms

| Platform | Built with | Notes |
| --- | --- | --- |
| pretix | Python, Django | Most complete: quotas, invitation links (useful for comps), seating, check-in app, badges. Large codebase; expects to run checkout |
| Hi.Events | PHP (Laravel), React | Simpler and modern: QR check-in, attendee messaging. No badge printing or reserved seating |

Both are AGPL-3.0: if modified and run as a web service, the modified source must be offered to users. We use them as design references, not as a base.

## Four paths

| Path | Effort | Assessment |
| --- | --- | --- |
| A. Build a focused companion to Give Lively | Moderate; the core fits if we hold to P0 | **Recommended** |
| B. Fork pretix or Hi.Events | High; weeks to learn the codebase, duplicates Give Lively checkout | Design reference only |
| C. Extend an existing teammate app | Moderate | **Adopted with A**: the build continues on Natalie's backend and portal (PRs #25, #26) <!-- modified 2026-10-06 05:50 Aisling --> |
| D. Recommend an existing product, build only an import helper | Low | Honest fallback |

A custom tool is justified only if it keeps Give Lively, costs AAFE less per year than a mid-priced gala tool, and has a named owner after Demo Day. If those conditions fail, recommending an existing product is the more honest outcome.

## What we copy, and what we add

**Proven patterns to copy:** seats allocated by package; purchaser separate from attendee; a private link for sponsors to add and edit guest names (GalaBid and RSVPify); personal invitation links for comps (pretix); table assignment; check-in search by name, table, or QR code (ClickBid); badge and CSV exports.

**What no tool offers AAFE:**

- Give Lively's attendee export as the main feed
- Manual entry for checks and direct deposits, with a verification status
- A comp category that tracks RSVPs without payment
- An AAFE relationship owner on every guest
- A missing-information queue, plus duplicate and conflict flags across sources
- Staff-approved follow-up drafts

**Not ours to build:** payment processing, ticket checkout, auctions, or a donor CRM.

## Where earlier research was superseded
<!-- team -->
<!-- updated 2026-10-05 16:51 Aisling -->

Natalie's research predates the October 1 call. Where it differs, discovery and the decision log win: <!-- new 2026-10-03 11:56 Aisling -->

| Research said | Now <!-- new 2026-10-03 11:56 Aisling --> |
| --- | --- |
| Give Lively forms are embedded on aafe.org | Registration links out to Give Lively; it isn't embedded <!-- new 2026-10-03 11:56 Aisling --> |
| Option B: an AAFE Stripe checkout that collects names at purchase | Out of scope: the tool never processes payments <!-- new 2026-10-03 11:56 Aisling --> |
| Drag-and-drop seating chart | A seating map that staff control is in the Demo Day scope (Oct 7); nothing seats guests automatically <!-- modified 2026-10-08 04:15 Aisling --> |
| A $50,000 sponsorship with 12 seats | Confirmed: AAFE's 2026 flyer gives Platinum ($50,000) 12 guaranteed seats <!-- modified 2026-10-05 16:51 Aisling --> |
| November 9 presentation | Nov 9 is the team's last work day; Demo Day is Nov 10 <!-- new 2026-10-03 11:56 Aisling --> |

Natalie's clickable prototypes and seed data (Oct 2) are reviewed in `docs/research/prototype-review-2026-10-03.md`: six pieces of her schema were adopted into the data model, and four prototype behaviors had to change: automatic emails, readable sponsor links, and sequential QR codes are fixed (PR #26); real photos still need AAFE's written approval before Demo Day. <!-- modified 2026-10-06 05:50 Aisling -->

## Give Lively's limits

Covered on the [Systems](#systems) page: no public API, no comps, no conditional questions by package, sponsors can't edit guest names, and per-ticket detail only in the Attendee Data export.

## aafe.org and its web partner

Covered on the [Systems](#systems.aafe-org-and-its-web-partner) page: AAFE works with GreyBox Creative, the prototype matches the site's look, and production hosting is AAFE's call (see [Hosting](#hosting)). <!-- removed 2026-10-08 04:15 Aisling Three bullets that repeated the Systems page -->

## Questions this raises for AAFE

1. Which platform did AAFE consider too expensive, and what did it cost?
2. Is AAFE committed to staying on Give Lively for tickets and payments?
3. Would AAFE pay about $1,000–$1,500 a year for a supported tool, or is the budget zero?
4. Who at AAFE would own the tool after Demo Day?
