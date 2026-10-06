# Hosting

We are building a capstone prototype, not choosing AAFE's production infrastructure. The team delivers a working, AAFE-branded prototype with invented data, plus code and documentation that any qualified partner can pick up. **Production hosting is intentionally not selected during this project.** AAFE decides that, if it adopts the tool, after reviewing the finished prototype.

## What we hand over

- Source code for the prototype
- Setup and local-development documentation
- Product requirements and workflow documentation
- The data model and invented sample data
- Known limitations and future opportunities
- Production-readiness notes for any future implementation

## Who decides what

| The capstone team | AAFE, later |
| --- | --- |
| Builds a convincing, useful prototype | Decides whether the tool is worth adopting |
| Uses invented data only | Decides when, and whether, real data is used |
| Delivers clean code and documentation | Chooses GreyBox Creative, another vendor, or internal staff |
| Runs a temporary demo preview | Chooses a production host and budget |
| Explains future considerations | Approves privacy, security, support, and maintenance policies |
| Keeps the code portable | Decides which integrations are worth paying for |

The prototype uses a standard, portable stack (React and TypeScript on Supabase's Postgres), so a future partner isn't tied to us. <!-- modified 2026-10-05 16:51 Aisling -->

```notes
The point to land: AAFE isn't being asked to open accounts, pay for anything, or commit to maintenance before they've seen the finished product. That's their call after Demo Day.
```

## Before any real data: production-readiness checklist

Whoever runs a production version should be able to say yes to each of these, whichever host they choose.

- **Ownership:** billing account and workspace owned by AAFE; a named administrator and a backup administrator.
- **Access:** separate roles for gala administrators, relationship managers, and check-in volunteers; MFA on staff admin accounts.
- **Sponsor links:** secure, expiring, and revocable, with a defined revocation process.
- **Encryption:** HTTPS everywhere; the managed database encrypted at rest.
- **Exports:** a decision about who may download guest lists.
- **Backups:** a documented backup, restore, retention, and deletion process, with a restore that has actually been tested.
- **Gala night:** a support plan with a phone escalation contact, a downloaded check-in list and a printed alphabetical backup, and a tested procedure for weak connectivity.
- **Data review:** a data-processing and acceptable-use review before any real personal information is entered.
- **Two owners:** a business owner and a technical or vendor owner. One person may hold both roles, but the responsibilities differ.

## Demo preview: team notes
<!-- team -->
<!-- modified 2026-10-05 16:51 Aisling -->

- The demo runs under a team account with invented data, on Supabase's free plan (decided Oct 5). Where the web app itself is previewed is still open. <!-- modified 2026-10-05 16:51 Aisling -->
- A free Supabase project pauses after a week without activity. Wake it before any demo, or rebuild it from the seed data. <!-- modified 2026-10-05 16:51 Aisling -->
- Free web services can sleep when idle; wake the preview before any demo.

## Future hosting paths, for the handoff notes
<!-- team -->
<!-- updated 2026-10-05 16:51 Aisling -->

Reference for a future partner, not a decision for AAFE now. Because the prototype uses Supabase for data, sign-in, and server functions, paths that keep Supabase are the shortest; moving fully off it is more work. Costs are estimated base costs before usage, tax, optional storage, and vendor price changes. <!-- modified 2026-10-05 16:51 Aisling -->

| Path | When it fits | Estimated base | Readiness work still required |
| --- | --- | --- | --- |
| A. Render + Postgres | A custom sponsor workflow and an AAFE-owned product at a modest, predictable cost | About $13 a month | Confirm the database tier's backup and recovery features; test a restore; set up roles and MFA; name owners |
| B. Google Workspace + AppSheet | Zero incremental cost and staff maintainability matter most | Potentially $0, if AAFE's edition includes the AppSheet features needed | A short proof of capability: sponsor links, external users, duplicates, audit history, check-in |
| C. Vercel + Supabase | Willing to pay more for managed tooling and a polished deploy workflow | About $45 a month before usage | Justify the higher base cost and two vendors |

- **Google Cloud** stays an internal option only if someone owns the console, deployment, database, access management, networking, and billing.
- **Fly.io** is not recommended at AAFE's current capacity: more operational work, and with Neon, two vendors and two support paths.

Full notes and sources: [Future hosting notes (internal)](https://claude.ai/code/artifact/f74b0de5-c123-40b4-a9fd-c60be5297c41), revised after Natalie's critique.
