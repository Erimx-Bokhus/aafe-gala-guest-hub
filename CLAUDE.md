# AAFE Gala Guest List Tool

Pursuit AI Native Demo Day capstone, team ERIMX BOKHUS, for Asian Americans for Equality (AAFE).
A companion tool that sits on top of Give Lively: it turns ticket purchases, sponsorship pledges,
checks and direct deposits, and comps into one complete, editable guest list, with a private
sponsor portal for guest names, a staff workspace, badge exports, and gala-night check-in.

**Scope: a working prototype with invented data, plus code and documentation AAFE can hand to any
technical partner.** Production hosting and real data are AAFE's decisions after Demo Day (Nov 10).

## Read first
- `docs/discovery-2026-10-01.md`: what the client actually said (highest authority after the client)
- `docs/requirements.md`: prioritized requirements
- `docs/decisions.md`: decision log; do not reopen a decision without new information
- `docs/data-model.md`: proposed schema and the merge plan with Natalie's prototype schema
- `docs/data-handling.md`: data and AI commitments made to the client
- `docs/research/`: team research (Natalie's source of truth, Give Lively analysis, intake form)
- `hub/`: the same material as a browsable site (`npx serve hub`)

## Hard rules
1. **No real donor data, ever.** Fixtures and demo data are invented. Never commit real names, emails, or exports from AAFE.
2. **No payment processing.** Do not integrate Stripe or store card, bank, or ACH details. Payment is recorded as method, date, status, and amount entered by staff or imported from Give Lively.
3. **Secrets never in code.** `.env*` is gitignored; `.env.example` holds placeholders. Keys stay server-side; nothing secret in client bundles.
4. **Staff approve every email before it sends.** No automatic sends, including sponsor portal links after a Give Lively purchase: queue a draft for approval. A staff member who reviews and sends their own email (e.g. a relationship manager sending a comp ticket) counts as the approver; the send is logged.
5. **AI is optional and off by default.** No AI call may receive email addresses, phone numbers, or payment info. Nothing AI-generated goes out without staff approval.
6. **Sponsor links and QR e-tickets are secrets.** Tokens are random (at least 128 bits) and stored hashed. Sponsor links are scoped to one order and expire at AAFE's deadline; QR e-tickets are scoped to one seat and expire after gala night. Never use readable slugs like an organization name.
7. **Record source and history.** Every guest record keeps its source (Give Lively import, staff entry, sponsor portal, check-in desk for walk-ins) and a change log. Staff corrections must survive the next import.
8. **AAFE's logo and real event photos stay internal until AAFE approves in writing.** They may be used in this private repo and in reviews with the team and AAFE. Anything public, including Demo Day, uses placeholders until approval is recorded in `docs/decisions.md`. Avoid photos where a real attendee's name badge is readable.
9. **Maintainability over cleverness.** AAFE's tech capacity is "pretty low." Prefer mainstream, well-documented choices a future partner can pick up.

## Stack
**Status: pending team decision (Oct 3–5).** Do not scaffold until `docs/decisions.md` records the choice.
Candidates on the table: React + TypeScript with Supabase Postgres (matches Natalie's prototype and seed data), or Next.js + TypeScript with Postgres. Either way: Postgres, typed code, and the import/matching logic isolated in its own tested module.

## Reference prototype
Natalie built clickable concepts of the sponsor portal and staff app (shared in Slack Oct 2; source link pending). Treat them as the UI reference, not the scope: emails, seating chart, fee analytics, and Salesforce sync are trimmed per `docs/requirements.md`. Her seed data is in `seed/natalie-prototype/`; what was adopted and what must change is in `docs/research/prototype-review-2026-10-03.md`.

## Working in this repo
- Branches: `main` is protected by review. Aisling is the repo admin: every pull request is reviewed and merged by Aisling (`nessaisling-lab` or `aislingld-pursuit`); each person works on their own branch (`aisling`, `natalie`, `cornell`, `antonin`) or a short feature branch off it (`aisling-import-engine`; a `name/...` prefix is impossible while a branch called `name` exists).
- Merge `main` into your branch often; send work back as small pull requests.
- Commit messages say what changed and why. Credit co-authors with `Co-authored-by:` trailers.

## Team
| Person | GitHub | Role |
| --- | --- | --- |
| Natalie Walker | wsvdesign | Product lead, UI/UX, client contact |
| Aisling Leiva-Davila | nessaisling-lab / aislingld-pursuit | Backend, GitHub and integrations |
| Cornell Robertson | CodeToTheCore | Backend lead |
| Antonin Lesov | antoninlesov | Frontend, UI/UX |

## Key dates
- Oct 3–5: stack decided, areas assigned
- Oct 30: full path working end to end; AAFE feedback
- Nov 10: Demo Day; code and docs handed to AAFE
- Target event: AAFE's 2027 gala
