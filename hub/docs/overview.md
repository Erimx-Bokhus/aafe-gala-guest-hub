# Overview
<!-- modified 2026-10-05 16:51 Aisling -->
<!-- reviewed 2026-10-08 Aisling -->

AAFE runs one gala a year for 500–600 guests, and its guest list lives in a single spreadsheet that staff rebuild by hand from Give Lively purchases, emailed sponsorship pledges, checks, and comps. We are building one reliable guest list on top of Give Lively that sponsors can update themselves and staff can trust from first purchase to gala-night check-in.

```steps
Purchases and pledges come in | Give Lively tickets, emailed sponsorships, checks, comps
Each package becomes its seats | A $25,000 Silver sponsorship holds 10 seats
Guest details fill each seat | Sponsors name and edit their own guests
Empty seats get flagged | Sorted by the AAFE staff member who owns the relationship
Final list, badges, check-in | Exports for printing, iPad check-in at the door
```

```notes
Open with the spreadsheet: every year staff rebuild one guest list by hand from four sources. The five steps are the whole product. Everything else in this hub supports one of them.
```

## Follow one sponsorship

One invented sponsor, start to finish. Step through it, or use the arrow keys in present mode.

```walkthrough
sponsor: Lantern Street Partners | Champion sponsorship | $7,500 | 6
guests: A. Rivera, Director; K. Osei, VP Community; M. Chen, CFO; D. Park, Board Member; S. Haddad, Partner; L. Novak, Analyst
Pledge arrives by email | The sponsor commits $7,500 by email. A staff member enters it by hand and becomes the relationship owner. | pay=Pledged; named=0; dash=New commitment · owner assigned
The package becomes seats | Champion includes 6 seats, so the tool creates 6 open seats tied to this commitment. | pay=Pledged; named=0; flag=1; dash=6 names missing
Sponsor gets a private link | No account needed. The link opens only this sponsorship and closes at AAFE's deadline. | pay=Pledged; named=0; flag=1; link=1; dash=Link sent · 6 names missing
Names come in | The sponsor names 4 guests. The 2 open seats appear on the owner's follow-up list, with a reminder drafted for staff to approve. | pay=Pledged; named=4; flag=1; link=1; dash=2 names missing · reminder drafted
The check arrives | Staff record the check. The payment status changes; no bank details are stored. | pay=Received · check; named=4; flag=1; link=1; dash=Paid · 2 names missing
Last names, then review | The final 2 names arrive. The owner corrects one title before printing, and the correction survives the next import. | pay=Received · check; named=6; fix=3; dash=Complete · reviewed before print
Badges and the door | Badges print with table numbers. At check-in, 5 of 6 guests arrive, and the Salesforce file records who came. | pay=Received · check; named=6; arrived=5; table=12; dash=5 of 6 checked in
```

```notes
This is the demo in miniature. Pause on step 4: the sponsor fixes their own list, which is AAFE's top priority from the call. Step 6 answers the 2026 name-tag problem.
```

## At a glance

| | |
| --- | --- |
| Client | Asian Americans for Equality (AAFE) |
| Contacts | Janelle Teng and Sarah Pritchard |
| Team | ERIMX BOKHUS, Pursuit AI Native Fellowship |
| Target event | AAFE's 2027 gala |
| Discovery call | October 1, 2026 |
| Demo Day | November 10, 2026 |
| Status | Building. Import engine and its database side done and tested; exports built; Natalie's staff app, sponsor portal, and Supabase backend in `main`; Supabase backend loaded in Aisling's test project; staff sign-in merged (PR #27); Korean in the portal (PR #51); email follow-ups, offline check-in, sponsor pipeline, and sponsor arrivals (off) built in the backend; Natalie's iPad check-in app in `main` (PR #56, Oct 8); three labeled demo data sets (PR #66); first prototype review with AAFE on Oct 15 <!-- modified 2026-10-08 08:15 Aisling --> |

## Team
<!-- updated 2026-10-05 20:37 Aisling pairs -->

| Person | Pair | Role | GitHub <!-- modified 2026-10-05 20:37 Aisling --> |
| --- | --- | --- | --- |
| Natalie Walker | Frontend | Product lead, UI/UX, client contact | wsvdesign <!-- modified 2026-10-06 05:50 Aisling --> |
| Antonin Lesov | Frontend | Frontend | antoninlesov <!-- modified 2026-10-05 20:37 Aisling --> |
| Aisling Leiva-Davila | Backend | Backend, repo admin | nessaisling-lab / aislingld-pursuit <!-- modified 2026-10-08 08:15 Aisling --> |
| Cornell Robertson | Backend | Backend, staff sign-in | CodeToTheCore <!-- modified 2026-10-08 08:15 Aisling --> |

Build work is split into two areas (Oct 5): **Frontend: Natalie + Antonin** (staff app, sponsor portal, check-in, branding) and **Backend: Aisling + Cornell** (Supabase backend, import, sign-in and roles, secure links, exports, emails). Who is building each part (Oct 7): Aisling (Supabase backend, import, secure links, exports, emails, offline check-in, pipeline), Cornell (staff sign-in), Natalie (product lead and client contact; sponsor portal, staff app, iPad check-in app, PRDs), and Antonin (portal ideas, Korean). Component status is on the [Build plan](#build-plan). <!-- modified 2026-10-08 08:15 Aisling -->

## What we will not build

- A replacement for Give Lively. AAFE keeps it for tickets, donations, and tax receipts.
- Anything that processes payments or stores card or bank details.
- Automatic seating. Staff place guests at tables themselves on a simple seating map; the tool never seats anyone automatically. <!-- modified 2026-10-08 08:15 Aisling -->
- Production hosting. We deliver a portable prototype with invented data; AAFE, with the partner it chooses, decides whether and where it runs.

## How this hub works

Each page is a markdown file in `hub/docs/`. Edit the file, and the page updates. The same files sit in the code repository, so the team and Claude Code read from one source.
