# Risks
<!-- modified 2026-10-05 16:51 Aisling -->
<!-- modified 2026-10-08 04:15 Aisling AI and free-plan rows, owners, three new risks -->
<!-- removed 2026-10-08 05:10 Aisling The iPad app's missing build guard: fixed in PR #70 -->
<!-- updated 2026-10-08 16:40 Aisling New risk: the staff app not yet run with real sign-in -->
<!-- reviewed 2026-10-08 Aisling -->

What could go wrong, how likely it is, and what we are doing about it. Ranked by likelihood times impact; reviewed at each weekly check-in.

```risks
Real guest-list text from Give Lively is messier than the one sample | 3 | 2 | Split with plain rules first; anything unclear goes to staff review; ask AAFE for a few more redacted rows | Aisling
Pursuit's Demo Day expects AI features | 2 | 2 | Proposed to AAFE: none in v1; ideas listed on the Data and AI page | Natalie
The handoff isn't clear enough for another partner to pick up | 2 | 3 | Standard stack; setup docs a teammate has tested from scratch; invented seed data; a known-limitations list | Aisling, Natalie
The same guest arrives from several sources | 3 | 2 | Rule-based matching, a review queue, and corrections that survive re-import | Aisling
Sponsors don't use the form, as with the earlier Google Form | 2 | 3 | One link per sponsor showing their seat count; staff can enter names for them; staff-approved reminders | Natalie, Antonin
Scope grows toward a full event platform | 2 | 3 | Finish the must-haves end to end before anything else; log every scope change | Team
Weak internet at the venue during check-in | 2 | 3 | Check-in keeps working offline (built: offline module, PR #46; iPad app, PR #56); a printed list is exported the day before | Natalie, Aisling
Give Lively's exports differ from the samples | 2 | 2 | Column mapping on import; every row that fails is listed with a reason; tier mapping and gala-page filter; ask AAFE for more redacted rows and whether sponsorships share the export | Aisling
Wrong titles or affiliations on badges | 2 | 2 | The relationship owner reviews each badge before printing | Natalie
Real guest data gets into the prototype | 1 | 3 | Invented data only; imports tested with synthetic files; no real exports shared with the team; secrets kept out of the code; real-data guard required on every PR (PR #28) | Everyone
Translations read awkwardly | 2 | 1 | AAFE staff review every translated string before launch | Natalie
AAFE's AI policy rules out AI features | 2 | 1 | No AI in the first version; matching uses plain rules | Aisling
The demo preview's free tier lapses before Demo Day | 2 | 2 | Stay on free plans; wake Supabase before demos; rebuild from seed if it lapses | Aisling
Two sponsor portals drift apart | 2 | 2 | One portal (`prototype/guest-portal`); ideas from Antonin's prototype come in as small PRs that Natalie approves | Natalie, Antonin
A secret key reaches the browser or the repo | 1 | 3 | Keys that bypass the access rules live only in Supabase's secret store; build and demo-file guards (PR #36); secret scan on every PR; rotate every key at handoff | Aisling
The demo backend sits in one person's Supabase account | 2 | 2 | Agree on the demo's project and owner; the seed data and `npm run db:load` rebuild it anywhere; rotate keys at handoff | Aisling
The staff app hasn't yet run against Supabase with real sign-in | 2 | 2 | Live role checks on Aisling's test project pass (Oct 8); in-person sign-in test on Saturday, Oct 10, 12 PM at the Pursuit building (Cornell to confirm) | Aisling, Cornell
The Oct 7 scope additions crowd out the full path due Oct 30 | 2 | 3 | Hold to P0: the full path works end to end first; the Demo Day additions (C13) follow | Natalie, Aisling
```

```notes
The top risks are about real-world data: messy guest-list text and the same guest arriving from several sources. The handoff risk is the one we fully control: a partner we've never met should be able to run the prototype from the README.
```

## What would change the plan

- **AAFE decides not to adopt the tool.** The handoff still includes the market comparison on the [Research](#research) page, so AAFE can choose an existing product with full information.
- **AAFE wants Give Lively replaced.** That reopens the build-versus-buy decision; ClickBid and RSVPify become serious options.
- **More materials arrive.** Comp amounts, badge templates, and Give Lively screen recordings are still to come; the import adapts through column mapping. <!-- modified 2026-10-05 16:51 Aisling -->
