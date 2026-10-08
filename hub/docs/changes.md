# What's new

Every change to this hub, newest first. Open it while signed in to claude.ai and it shows what you haven't read yet, and the team can see who's caught up. You're identified by your claude.ai account; Aisling links each account to a team name once, and nobody else can change that. Opening a change or clicking its section's New/Updated tag counts as reading it.

Each change has a kind, shown the same way on every page next to the exact line that changed: **✦ New** (didn't exist before), **+ Updated** (rows, tasks, or terms added), **✎ Modified** (wording, numbers, or a rule changed), **− Removed** (taken out), and **! Important** (everyone should act on it). Hover an icon for the date, time (New York), and who made the change; click it to mark it read.

```changes
2026-10-08 20:40 | new | Aisling | decisions | The staff app saves every change through the server, which checks the role (PR #72); gala date and deadline changes move QR e-tickets and sponsor links; Node 22.18 or newer (PR #73); how teammates' PRs are reviewed
2026-10-08 20:40 | modified | Aisling | decisions | When sponsor links stop is now three options (A, B recommended, C) on the PR review plan, for Natalie and then AAFE; 43 advisor warnings after PR #72, all by design; new pending question on admins' direct table edits
2026-10-08 20:40 | modified | Aisling | build-plan.where-each-component-stands | Sign-in and roles, commitments and seats, and the staff dashboard are connected to the server (PR #72); about 1,230 automated checks (90 app)
2026-10-08 20:40 | updated | Aisling | tasks | PRs #72 and #73 reviewed, fixed and merged; the audit after the merge; four audit bugs fixed with tests (PR next) and the smaller findings listed; the deadline decision, the #76 split and #77 follow-ups
2026-10-08 20:40 | updated | Aisling | risks | New risk: the staff app hasn't yet run against Supabase with real sign-in; test on Saturday, Oct 10
2026-10-08 20:40 | modified | Aisling | architecture.what-s-built | Staff app: every change through a role-checked server function, reads through the access rules (PR #72)
2026-10-08 20:40 | modified | Aisling | overview | Status: roles checked on the server for every staff action (PR #72)
2026-10-08 20:40 | updated | Aisling | documents | New: the PR review plan for #72–#77
2026-10-08 18:45 | modified | Aisling | decisions | Supabase advisor: 41 warnings after PR #71 (the iPad undo function adds one of the same accepted kind); the test project now holds the Full gala, fixed set (553 guests)
2026-10-08 09:40 | modified | Aisling | build-plan.where-each-component-stands | The iPad check-in app is connected to the backend (PR #71): staff sign in, the door list comes from Supabase, check-ins sync with first arrival winning, and only the person who checked a guest in, or a gala admin, can undo it. The first live run waits for the in-person sign-in test
2026-10-08 09:40 | new | Aisling | decisions | The iPad shows an "Access needs" flag, not the details; undo is limited to the same person or a gala admin; demo mode keeps the demo sync server
2026-10-08 09:20 | modified | Aisling | tasks | PRs #42–#66 loaded into Aisling's test Supabase project; 40 advisor warnings, all the two kinds accepted by design (staff functions check the role inside; portal functions take the link as the credential)
2026-10-08 09:10 | modified | Aisling | build-plan.where-each-component-stands | The iPad check-in app now has the same build guard as the other two apps, builds in CI, and its demo file is drift-checked (PR #70)
2026-10-08 08:15 | new | Aisling | screens.ipad-check-in-app | Screens is now Live build, with six screenshots of Natalie's iPad check-in app on the Full gala (AAFE's logo as a grey placeholder)
2026-10-08 08:15 | new | Aisling | sketches | New page: Early sketches, the first wireframes moved off Screens; the check-in sketch is marked superseded by the iPad app
2026-10-08 08:15 | modified | Aisling | tasks | Tasks checked against the Oct 8 audit: sign-in split from server-side roles; no AI, PRDs and the three data sets (#18, PR #66) done; three Vercel projects; new tasks for the demo's Supabase project and the iPad app's build guard
2026-10-08 08:15 | modified | Aisling | build-plan | New component C13, Demo Day additions, with capacity rechecked; emails, exports and check-in bars show only what's left; Oct 15 review on the timeline; C1 names the two 553-guest galas; about 1,160 automated checks
2026-10-08 08:15 | modified | Aisling | architecture.what-s-built | Three apps on one database; no AI in v1; new rows for the iPad app, offline check-in, the approval queue, the pipeline, arrivals, translations and the data sets; the data model is labeled early design
2026-10-08 08:15 | modified | Aisling | import | Earlier questions and the original 22 test cases cut (the spec's cases are linked); the demo's three data sets described
2026-10-08 08:15 | modified | Aisling | decisions | What separates the two Full demo sets (Oct 8); three Vercel projects; the AI and retention question now waits on AAFE's Oct 15 review; the repo's log sorted by date
2026-10-08 08:15 | modified | Aisling | risks | AI and free-plan rows updated, owners fixed, and three new risks: one person's Supabase account, the Oct 7 additions against Oct 30, and the iPad app's missing build guard
2026-10-08 08:15 | modified | Aisling | overview | Status, roles and the seating line fixed; the who-builds-what paragraph now lives only here
2026-10-08 08:15 | modified | Aisling | data-ai | No AI in the first version throughout; dietary details follow the 60-day proposal; the two AI sections merged
2026-10-08 08:15 | updated | Aisling | discovery.still-to-ask | Four questions for AAFE: a grace period after the deadline, no AI in v1, 60-day deletion, and whether guest email is required
2026-10-08 08:15 | modified | Aisling | requirements.working-prd | Working PRD reconciled with Natalie's two PRDs; pre-fill reaffirmed; Oct 15 review added to the success measures
2026-10-08 08:15 | updated | Aisling | documents | Documents: the iPad app, WORKFLOW, data handling and data model, the translation sheet, the iPad screenshots, and Natalie's two PRDs
2026-10-08 08:15 | updated | Aisling | glossary | Eight new terms: iPad check-in app, door list, offline queue, approval queue, pre-fill, fingerprint, Vercel, labeled data sets
2026-10-08 08:15 | modified | Aisling | hosting.demo-preview-team-notes | Three Vercel projects; the backend stays in Aisling's test project until the team picks one; the iPad app syncs once connected to Supabase
2026-10-08 01:59 | new | Aisling | decisions | Sponsor links and QR e-tickets keep SHA-256 fingerprints (not SHA-512 or SHA-3): the codes are random, so a longer hash adds no protection, and SHA-256 works in every browser, Postgres, and Supabase
2026-10-08 01:50 | new | Aisling | build-plan.where-each-component-stands | Natalie's iPad check-in app is in `main` (PR #56): 553 invented guests A to Z, search, check in several at once with undo, QR scan, approved exceptions, offline queue. Next: connect it to the backend
2026-10-08 01:50 | modified | Aisling | build-plan.where-each-component-stands | Check-in sync fix (PR #60), full 128-bit QR code generator (PR #61), and invented names for 12 real organizations in the door list (PR #62); about 1,120 automated checks
2026-10-08 01:50 | new | Aisling | tasks.added-october-8 | New tasks: connect the iPad app to the backend (Aisling, with Cornell for sign-in); app manifest, opening offline and camera scanning (Natalie)
2026-10-07 23:27 | important | Aisling | decisions | Pre-fill stays: the Oct 7 "no pre-fill" decision is withdrawn and PR #58 closed unmerged. Clearly readable names from the Give Lively guest list still go into the sponsor's seats to confirm
2026-10-07 23:27 | modified | Aisling | requirements.must-have-for-demo-day | Give Lively import: pre-filled names for the sponsor to confirm, as before
2026-10-07 23:27 | modified | Aisling | tasks | The Chinese/Korean-name question is open again; the "drop the guest-list text" task is withdrawn
2026-10-07 22:38 | modified | Aisling | decisions | Decisions from Natalie's two PRDs: first prototype review with AAFE on Oct 15; emails follow AAFE's gala lead (staff approve every one); no pre-fill from Give Lively guest lists; new Demo Day scope; three labeled data sets; 60-day retention and no AI in v1 proposed to AAFE; who builds each part. New pending: edits after the deadline (withdrawn 23:27: pre-fill stays)
2026-10-07 22:38 | updated | Aisling | requirements.must-have-for-demo-day | Must haves added: iPad check-in, after-gala results, Give Lively fee analytics, a seating map that staff control, and a simulated Salesforce push; the import drops the typed guest list (withdrawn 23:27: pre-fill stays)
2026-10-07 22:38 | modified | Aisling | requirements.later-or-out-of-scope | Out of scope now: automatic seating, automatic emails (unless AAFE's gala lead asks), and a live connection to a real Salesforce org
2026-10-07 22:38 | modified | Aisling | data-ai | No AI in the first version (proposed to AAFE); retention proposal: contact details deleted within 60 days, dietary and accessibility included; sponsor arrivals built switched off
2026-10-07 22:38 | new | Aisling | tasks.added-october-7-night | New tasks: Natalie's PRD fixes, drop the guest-list text from the import, three labeled data sets, the iPad check-in PR, and the new must-have screens (withdrawn 23:27: pre-fill stays)
2026-10-07 22:38 | modified | Aisling | overview.team | Team: the two areas stay, and the page names who is building each part
2026-10-07 22:38 | modified | Aisling | build-plan | Prototype review with AAFE moved to Oct 15; who is building each part; check-in raised to P0; the import drops the typed guest list; three labeled data sets next (withdrawn 23:27: pre-fill stays)
2026-10-07 20:23 | modified | Aisling | hosting.demo-preview-team-notes | The Supabase backend runs in Aisling's test project, in her own account, not a team project: wording fixed on Hosting, Build plan, Overview, and Tasks
2026-10-07 20:23 | updated | Aisling | decisions | Open question: which Supabase project the demo and the handoff use, and who owns it
2026-10-07 19:15 | modified | Aisling | tasks | Cornell's staff sign-in (PR #27) and Antonin's Korean (PR #51) merged: tasks ticked off; Cornell's live sign-in test waits on which Supabase project the demo uses
2026-10-07 19:15 | modified | Aisling | build-plan.where-each-component-stands | Sign-in merged (PR #27); the portal now has all four languages (PR #51); about 1,110 automated checks
2026-10-07 19:15 | modified | Aisling | architecture | Staff app has real sign-in (demo accounts when no keys are set); the portal adds 한국어
2026-10-07 19:15 | modified | Aisling | overview | Status as of Oct 7 evening: sign-in merged, Korean in the portal, and the backend work from PRs #42–#50
2026-10-07 13:45 | new | Aisling | tasks.added-october-7 | Oct 7: what was built tonight, and what's next for each pair (Vercel setup, check-in screen, pipeline board, arrivals in the portal, AAFE's translation review)
2026-10-07 13:45 | updated | Aisling | decisions | Six decisions: Vercel for the demo, offline check-in, first arrival wins, the sponsor pipeline, AAFE-gated features built switched off, and the test gala for tests only; a new open question on names in Chinese or Korean script
2026-10-07 13:45 | updated | Aisling | build-plan.where-each-component-stands | Component status, Oct 7: emails, offline check-in, the sponsor pipeline, sponsor arrivals (off), translations, and a 553-guest test gala built (PRs #42–#50); about 1,090 automated checks
2026-10-07 13:45 | modified | Aisling | build-plan.testing-what-to-add | Testing list: staff-action logging, access rules for every table and role, sponsor link limits, email and sync tests, and import edge cases done, plus a full-size gala
2026-10-07 13:45 | updated | Aisling | hosting.before-any-real-data-production-readiness-checklist | From Natalie's hosting critique: keep the guest tool separate from the public website, confirm the custom-address process, set how long data is kept, and name who tests restores
2026-10-07 13:45 | modified | Aisling | hosting.demo-preview-team-notes | Demo host decided: Vercel's free plan, two projects, keys in Vercel's settings only
2026-10-07 13:45 | modified | Aisling | hosting.who-decides-what | AAFE chooses its technical partner (wording follows the corrected GreyBox note)
2026-10-07 02:18 | modified | Aisling | tasks | GreyBox correction done in the docs: the web partner is most likely GreyBox Creative (not graybox.co), who hosts aafe.org is unconfirmed, and the unverified OVH server note is gone
2026-10-07 00:11 | updated | Aisling | discovery.still-to-ask | Two questions for AAFE: who sends tax acknowledgments to check and ACH sponsors, and whether the tool's payment confirmation replaces the one accounting already emails
2026-10-07 00:11 | modified | Aisling | systems.stripe | How AAFE acknowledges check and ACH gifts is now an open question, not a stated fact: the October 1 call didn't cover it
2026-10-06 21:33 | updated | Aisling | decisions | All six checks now run on every pull request and are required on main, including a new server function type-check (PR #40); live Supabase checks stay manual
2026-10-06 21:12 | modified | Aisling | tasks.added-october-6 | Cornell gets the Supabase keys in person with Aisling, who sets up his access and watches the live sign-in test
2026-10-06 20:56 | updated | Aisling | decisions | Two decisions from PR #36: keys that bypass the access rules stay in Supabase's secret store, enforced by build and demo-file guards; app unit tests use Vitest in CI
2026-10-06 20:56 | updated | Aisling | build-plan.where-each-component-stands | Key protection and app unit tests done (PR #36); 20 sign-in tests added to #35; 221 automated tests on main
2026-10-06 20:56 | updated | Aisling | architecture.what-s-built | New row: key protection (build guard, demo-file guard, secret scan); app unit tests in the PR checks
2026-10-06 20:41 | updated | Aisling | build-plan.where-each-component-stands | Component status, Oct 6 evening: sign-in in review with its conflicts fixed (#35), exports live, Antonin's portal ideas to port, prototype demonstration Oct 19, live sign-in test added to testing
2026-10-06 20:41 | updated | Aisling | requirements.working-prd-until-the-final-prds-arrive | Working PRD: Natalie drafting the team PRD; portal ownership and the Oct 19 demonstration; a testing row; gala-night arrivals for sponsors; portal uploads and payments out of scope
2026-10-06 20:41 | updated | Aisling | tasks.added-october-6-evening | New tasks: PR #36, sign-in tests, live sign-in test, porting Antonin's ideas, AAFE privacy review, guest email decision; Oct 7 demo replaced by Oct 19
2026-10-06 20:41 | updated | Aisling | decisions | Decisions: one sponsor portal, sponsors see gala-night arrivals, exports return rows, Oct 19 demonstration; guest email pending; 31 accepted advisor warnings
2026-10-06 20:41 | updated | Aisling | risks | Two new risks: sponsor portals drifting apart, and a secret key reaching the browser or the repo
2026-10-06 20:41 | updated | Aisling | hosting.before-any-real-data-production-readiness-checklist | Production checklist: rotate keys at handoff, new Supabase keys, limited origins, MFA
2026-10-06 20:41 | updated | Aisling | glossary | New terms: anon key, service role key, Edge Function secrets
2026-10-06 06:30 | updated | Aisling | build-plan.where-each-component-stands | Exports built in the database: badge file with table numbers, printed check-in list, and Salesforce attendee file (PR #34); backend tests now 119
2026-10-06 06:25 | new | Aisling | changes | Weekly review check: every page shows when it was last reviewed, and the sidebar and What's new flag pages that go more than 7 days without one
2026-10-06 06:12 | modified | Aisling | decisions | Answers to the audit's 17 questions: seven decisions logged and both decision logs synced, Korean and Traditional Chinese, sign-in, QR scope, Cornell's keys, hosting order, and New York dates
2026-10-06 05:50 | modified | Aisling | tasks | Page audit: 41 outdated facts and wording fixed across 14 pages (test counts, PR states, branch protection, purchase key, risks, decisions); each line has its own icon
2026-10-06 05:45 | new | Aisling | screens.the-build-so-far | Screenshots, two GIFs, and a 25-second video of the real build, with AAFE's logo and photos swapped for placeholders
2026-10-06 05:34 | new | Aisling | history | New page: History, every hub edit (with removed text) and every merged pull request, filtered by day, week, or month
2026-10-06 05:10 | modified | Aisling | changes | Change icons now sit at the left of every changed row, task, term, and paragraph across the hub (262 lines, dated from git history)
2026-10-06 04:58 | new | Aisling | changes | Change icons: ✦ new, + updated, ✎ modified, − removed, ! important, next to the exact line that changed; hover for the date and time
2026-10-06 04:24 | new | Aisling | changes | New page: What's new, with "unread by me", "made by me", and who on the team has read each change, tied to each person's claude.ai account
2026-10-06 04:16 | new | Aisling | requirements.working-prd-until-the-final-prds-arrive | Working PRD: what stands in for the PRD until Natalie's and Pursuit's are final, and why it's set up this way
2026-10-06 03:06 | modified | Aisling | build-plan.where-each-component-stands | Setup and guardrails: frontend build check, demo-data drift check, and real-data guard done (PR #28)
2026-10-06 03:06 | modified | Aisling | build-plan.testing-what-to-add | Testing list: the first three items are done
2026-10-06 03:05 | updated | Aisling | tasks.added-october-6 | Supabase backend loaded and its security warnings cleared (PR #30); real-data guard now required before merging
2026-10-05 22:58 | new | Aisling | architecture.what-s-built | What's built so far: import engine, database and server functions, server jobs, both apps, and the checks on every PR
2026-10-05 22:58 | new | Aisling | import.built-and-tested | Import engine built and tested on AAFE's real export format (PRs #23, #24)
2026-10-05 22:58 | updated | Aisling | decisions | Six October 6 decisions: three import rules, tier mapping, QR e-tickets, and Natalie's backend as the base
2026-10-05 22:58 | updated | Aisling | glossary | New terms: purchase key, tier mapping, gala page name, import engine
2026-10-05 21:28 | new | Aisling | import.tier-names-and-the-gala-page | Import: staff map Give Lively tier names to packages once per gala, and only this gala's page is imported
2026-10-05 20:37 | updated | Aisling | overview.team | Build work split into two pairs: Frontend (Natalie + Antonin) and Backend (Aisling + Cornell)
2026-10-05 16:51 | new | Aisling | discovery.what-aafe-sent-on-october-5 | What AAFE sent on October 5: the guest spreadsheet, a Give Lively export, and the tier flyer
2026-10-05 16:51 | modified | Aisling | architecture.stack | Stack decided: React and TypeScript on Supabase
2026-10-05 16:51 | updated | Aisling | requirements.must-have-for-demo-day | Requirements updated from AAFE's data: guest categories, and seated versus admitted guests
```

