# Sponsor Portal: design prototype

Design reference by Antonin Lesov (frontend / UX), team ERIMX BOKHUS, for AAFE's gala guest-list tool.
Built in Figma Make, then refined locally. **Demo data only. Not the production app.**
The real app lives in `prototype/guest-portal` (Supabase). This folder shows the target UX.

## Run it
```bash
pnpm install   # or: npm install
pnpm dev       # open http://localhost:8443
```
Use the **Prototype** switcher (bottom-left) to move between Sponsor portal, Check-in, Seating, the expired-link screen and Gala night.

## What's inside
| Path | What |
|---|---|
| `src/App.tsx` | All screens (sponsor portal, check-in, seating) |
| `src/index.css` | Styles; tokens at the top follow `docs/design.md` |
| `src/AafeLogo.tsx` + `src/aafe-logo.css` | Animated AAFE logo (EN → ES → 中文 → 한국어), rebuilt from aafe.org |
| `docs/design.md` | Team design system (Natalie, PR #14). Source of truth |
| `brand/` | AAFE brand kit measured from aafe.org: logos, colors, type, contrast, screenshots |

## Sponsor portal features
- One home card for guests: live progress, deadline, Add guests / See seats
- Add one by one with live badge preview, or paste a whole list
- Seats list with filters and status (empty / received / confirmed); empty seats highlighted
- Dietary and accessibility needs saved per guest; edit, replace, remove
- Contribution: paid, commitment, balance, status, payments, how to pay
- Event details: date, doors, program, venue, dress code
- Logo upload for signage with "sponsor wall" preview
- Activity log (who changed what, when)
- 4 languages (EN / 中文 Traditional / ES / 한국어), text size control
- Trust details: contacts, private-link note, privacy note, expired-link screen

## Rules
- No real donor data. AAFE logo and photos are internal until AAFE approves in writing.
- `AGENTS.md` / `CLAUDE.md` were written by Figma Make for its own environment.
