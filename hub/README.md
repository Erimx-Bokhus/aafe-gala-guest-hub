# Project hub

A browsable, presentable view of the project docs. Each page is a markdown file in `docs/`; `index.html` renders them with AAFE's palette and the team deck's typefaces.

Published version: https://claude.ai/artifact/QVViUNx6SWRBZYKCfrAmp6

## View it locally

Browsers block a page opened straight from your files from reading other files, so serve the folder:

    cd hub
    npx serve

Then open the address it prints. Locally, task checkmarks save in your browser only; on the published version they're shared with the team.

## Edit a page

Edit the markdown file in `hub/docs/`. To add a page, add the file and one line to the `PAGES` list near the top of the script in `index.html` (`team: true` hides it in client view).

Put `<!-- team -->` on the line after a `##` heading to hide that section in client view.

## Mark what changed

Every marker is an HTML comment: the kind, the date and time in New York time, who made the change, and an optional note.

    <!-- modified 2026-10-06 14:32 Aisling -->

| Kind | Icon | Use it when |
| --- | --- | --- |
| `new` | ✦ | The page, section, or line didn't exist before |
| `updated` | + | Something was added to existing content (rows, tasks, terms) |
| `modified` | ✎ | Existing content was changed or corrected (wording, numbers, a rule) |
| `removed` | − | Something was taken out; say what in the note: `<!-- removed 2026-10-06 14:32 Aisling Pending row on code ownership -->` |
| `important` | ! | Everyone should act on it: a decision reversed, a rule changed, a deadline moved. Use rarely |

Where the marker goes decides what it marks:

- **On the line after the `#` title:** the whole page.
- **On the line after a `##` heading:** that section. It shows as a labelled tag on the heading.
- **At the end of a line, list item, or table cell:** that exact line. It shows as a small icon; in a table row, put it before the last `|`.

Hovering any tag or icon shows the kind, date, time, who, and note. Clicking it marks it read for that person only (saved in their browser); clicking a section's tag also clears the icons inside that section. The sidebar badge shows the most significant unread marker on the page (important, then new, removed, modified, updated); team-only sections don't count in client view. Markers stay in the file until someone deletes them. Older markers with free-text dates (`<!-- new Oct 3 -->`) still work.

## Log the change on What's new

Every hub update also adds one line at the top of the `changes` block in `docs/changes.md`:

    2026-10-06 14:32 | new | Aisling | requirements.working-prd-until-the-final-prds-arrive | One sentence on what changed

Date and time (New York), the kind (`new`, `updated`, `modified`, `removed`, `important`), whose work it was (one of the four team names, so "Made by" works), the page id and section to link to (the section is the heading in lowercase with dashes; leave it off to link the page), and what changed. Don't reword an old line: its wording is part of how readers' "read" state is remembered.

On the published hub, each reader is identified by their claude.ai account; nobody types or picks a name. Their read state is saved in the artifact's shared storage under that account (each person can write only their own), and everyone sees who has read each change. The hub's owner (Aisling) links each account to a team name once, under "Link accounts to team names" on What's new; the storage rules let only the owner change those links. Locally, or signed out, read state stays in that browser. The page is team-only, so client view never shows it.

## Custom blocks

Write these as fenced code blocks with the name after the backticks.

| Block | One line per | Format |
| --- | --- | --- |
| `steps` | step | `Title | detail` (numbered 一二三…) |
| `layers` | layer | `Layer | Item — detail; Item — detail` |
| `timeline` | component | `ID | Name | start | end | owner | AI days | by-hand days`, plus `start:`/`end:` and `milestone | Name | date` (`milestone*` = accent) |
| `workload` | — | Adds up the timeline above it by owner; `note: Name | text` adds a row |
| `costbars` | option | `Label | low | high | group | note`, plus `title:` and `scale: log 100 30000` or `scale: linear 0 600`. Groups: today, ours, gala, enterprise, other |
| `ranges` | estimate | `Label | low | high | hand/ai | note`, plus `title:`, `max:`, `band: Name | low | high` |
| `walkthrough` | step | `Title | detail | pay=…; named=…; flag=1; link=1; fix=…; arrived=…; table=…; dash=…`, plus `sponsor:` and `guests:` |
| `decision` | check | `Question? | outcome | update/review/new/reject`; `!` before the question means the outcome is on "No"; `else | outcome | kind` ends it; `start:` sets the entry |
| `erd` | table | `name @col,row | field; field → target`; tables after a `--- Label` line show below without lines |
| `risks` | risk | `Title | likelihood 1–3 | impact 1–3 | mitigation | owner` |
| `glossary` | term | `Term | definition` |
| `wireframe dashboard`, `wireframe sponsor`, `wireframe checkin` | — | Rough sketches, hard-coded in `index.html` |
| `notes` | — | Speaker notes for the section (hidden in client view; N in present mode) |

## Present

Click Present (or press P). Each section shows on its own; arrow keys or the space bar move through sections and pages, and step through the sponsorship walkthrough. N shows speaker notes, Esc exits.

## Client view

Hides team-only pages and sections and speaker notes, and adds `~client` to copied links. It hides; it doesn't lock. Anyone with the link can switch back.

Prepared by team ERIMX BOKHUS, Pursuit AI Native Fellowship. Not an official AAFE website.
