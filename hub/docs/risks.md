# Risks
<!-- modified 2026-10-05 16:51 Aisling -->

What could go wrong, how likely it is, and what we are doing about it. Ranked by likelihood times impact; reviewed at each weekly check-in.

```risks
Real guest-list text from Give Lively is messier than the one sample | 3 | 2 | Split with plain rules first; anything unclear goes to staff review; ask AAFE for a few more redacted rows | Aisling
AI features turn out to be required and aren't planned | 2 | 2 | Team confirms this week; candidates are on the Data and AI page | Team
The handoff isn't clear enough for another partner to pick up | 2 | 3 | Standard stack; setup docs a teammate has tested from scratch; invented seed data; a known-limitations list | Aisling, Natalie
The same guest arrives from several sources | 3 | 2 | Rule-based matching, a review queue, and corrections that survive re-import | Aisling
Sponsors don't use the form, as with the earlier Google Form | 2 | 3 | One link per sponsor showing their seat count; staff can enter names for them; staff-approved reminders | Antonin, Cornell
Scope grows toward a full event platform | 2 | 3 | Finish the must-haves end to end before anything else; log every scope change | Team
Weak internet at the venue during check-in | 2 | 3 | Check-in keeps working offline; a printed list is exported the day before | Antonin
Give Lively's exports differ from the samples | 2 | 2 | Column mapping on import; every row that fails is listed with a reason; spec lists what to check first (per-ticket ID, refunds) | Aisling
Wrong titles or affiliations on badges | 2 | 2 | The relationship owner reviews each badge before printing | Antonin
Real guest data gets into the prototype | 1 | 3 | Invented data only; imports tested with synthetic files; no real exports shared with the team; secrets kept out of the code | Everyone
Translations read awkwardly | 2 | 1 | AAFE staff review every translated string before launch | Natalie
AAFE's AI policy rules out AI features | 2 | 1 | Matching works without AI; AI features ship switched off | Aisling
The demo preview's free tier lapses before Demo Day | 2 | 2 | Use a paid starter tier for the demo month, or rebuild the database from seed data | Aisling
```

```notes
The top risk is about AAFE's materials, not code. The handoff risk is the one we fully control: a partner we've never met should be able to run the prototype from the README.
```

## What would change the plan

- **AAFE decides not to adopt the tool.** The handoff still includes the market comparison on the [Research](#research) page, so AAFE can choose an existing product with full information.
- **AAFE wants Give Lively replaced.** That reopens the build-versus-buy decision; ClickBid and RSVPify become serious options.
- **More materials arrive.** Comp amounts, badge templates, and Give Lively screen recordings are still to come; the import adapts through column mapping.
