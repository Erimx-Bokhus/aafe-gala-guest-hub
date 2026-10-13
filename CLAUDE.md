# AAFE Gala Guest List Tool

Pursuit AI Native Demo Day capstone, team ERIMX BOKHUS, for Asian Americans for Equality (AAFE).
A companion tool that sits on top of Give Lively: it turns ticket purchases, sponsorship pledges,
checks and direct deposits, and comps into one complete, editable guest list, with a private
sponsor portal for guest names, a staff workspace, badge exports, and gala-night check-in.

**Scope: a working prototype with invented data, plus code and documentation AAFE can hand to any
technical partner.** Production hosting and real data are AAFE's decisions after Demo Day (Nov 10).

## Read first
- `docs/discovery-2026-10-01.md`: what the client actually said (highest authority after the client)
- `docs/aafe-materials-2026-10-05.md`: structure of AAFE's real spreadsheet, Give Lively export, tiers, and deadlines (the files stay out of the repo)
- `docs/requirements.md`: prioritized requirements
- `docs/decisions.md`: decision log; do not reopen a decision without new information
- `docs/data-model.md`: proposed schema and the merge plan with Natalie's prototype schema
- `docs/data-handling.md`: data and AI commitments made to the client
- `docs/research/`: team research (Natalie's source of truth, Give Lively analysis, intake form)
- Project hub: Aisling's own tracking site (not a team deliverable), in its own repo since Oct 11, [aafe-gala-guest-project-hub](https://github.com/Erimx-Bokhus/aafe-gala-guest-project-hub). Keep it in step with these docs

## Hard rules
1. **No real donor data, ever.** Fixtures and demo data are invented. Never commit real names, emails, or exports from AAFE.
2. **No payment processing.** Do not integrate Stripe or store card, bank, or ACH details. Payment is recorded as method, date, status, and amount entered by staff or imported from Give Lively.
3. **Secrets never in code.** `.env*` is gitignored; `.env.example` holds placeholders. Keys stay server-side; nothing secret in client bundles.
4. **Staff approve every email before it sends.** No automatic sends, including sponsor portal links after a Give Lively purchase: queue a draft for approval. A staff member who reviews and sends their own email (e.g. a relationship manager sending a comp ticket) counts as the approver; the send is logged.
5. **AI is optional and off by default.** No AI call may receive email addresses, phone numbers, or payment info. Nothing AI-generated goes out without staff approval.
6. **Sponsor links and QR e-tickets are secrets.** Tokens are random (at least 128 bits) and stored hashed. Sponsor links are scoped to one order and expire at AAFE's deadline; QR e-tickets are scoped to one seat and expire after gala night. Never use readable slugs like an organization name.
7. **Record source and history.** Every guest record keeps its source (Give Lively import, staff entry, sponsor portal, check-in desk for walk-ins) and a change log. Staff corrections must survive the next import.
8. **AAFE’s logo and event photos may appear in anything we build, including public links and Demo Day.** Decided Oct 13, 2026 by Natalie Walker (product lead), who owns this decision and its consequences; recorded in docs/decisions.md. AAFE sees the work at every review and can ask for anything to be taken down. Never use a photo where a real attendee’s name badge is readable (rule 1).
9. **Maintainability over cleverness.** AAFE's tech capacity is "pretty low." Prefer mainstream, well-documented choices a future partner can pick up.

## Stack
**Decided Oct 5** (`docs/decisions.md`): React + TypeScript (Vite, Tailwind) on Supabase (Postgres, Auth, Edge Functions), on Supabase's free plan for the prototype. Matches Natalie's prototype in `prototype/`. Keep the import/matching logic isolated in its own tested module.

## Reference prototype
Natalie built clickable concepts of the sponsor portal and staff app (shared in Slack Oct 2; source link pending). Treat them as the UI reference, not the scope: emails, seating chart, fee analytics, and Salesforce sync are trimmed per `docs/requirements.md`. Her seed data is in `seed/natalie-prototype/`; what was adopted and what must change is in `docs/research/prototype-review-2026-10-03.md`.

## Working in this repo
- **Never commit or push to `main`.** `main` is protected (GitHub Team, Oct 5): changes reach it only through a pull request with 1 approval and a passing secret scan (`gitleaks`); no force-pushes or deletion.
- Branches: each person works on their own branch (`aisling`, `natalie`, `cornell`, `antonin`) or a short feature branch off it (`aisling-import-engine`; a `name/...` prefix is impossible while a branch called `name` exists).
- Aisling is the repo admin: every pull request is reviewed and merged by Aisling (`nessaisling-lab` or `aislingld-pursuit`).
- Merge `main` into your branch often; send work back as small pull requests.
- Commit messages say what changed and why. Credit co-authors with `Co-authored-by:` trailers.

## Team
| Person | GitHub | Pair | Role |
| --- | --- | --- | --- |
| Natalie Walker | wsvdesign | Frontend | Product lead, UI/UX, client contact |
| Antonin Lesov | antoninlesov | Frontend | Frontend, UI/UX |
| Aisling Leiva-Davila | nessaisling-lab / aislingld-pursuit | Backend | Backend, GitHub and integrations, repo admin |
| Cornell Robertson | CodeToTheCore | Backend | Backend |

Work is split into two areas (Oct 5, `docs/decisions.md`). Frontend: staff app, sponsor portal, check-in, branding. Backend: Supabase backend, Give Lively import, sign-in and roles, secure links, exports, emails. Who is building each part (Oct 7): backend by Aisling (Supabase backend, import, secure links, exports, emails, offline check-in, pipeline) and Cornell (staff sign-in); frontend by Natalie (sponsor portal, staff app, iPad check-in app, PRDs) and Antonin (portal ideas, Korean).

## Key dates
- Oct 3–5: stack decided, areas assigned
- Oct 15: first prototype review with AAFE
- Oct 30: full path working end to end; AAFE feedback
- Nov 10: Demo Day; code and docs handed to AAFE
- Target event: AAFE's 2027 gala
