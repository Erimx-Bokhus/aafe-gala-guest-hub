# Live build
<!-- modified 2026-10-08 04:15 Aisling Split: the sketches moved to Early sketches; the iPad check-in app added -->
<!-- reviewed 2026-10-09 Aisling -->

The real apps in `prototype/`, running on invented demo data: Natalie's sponsor portal and staff app, and her iPad check-in app for the door. Layout and visual design belong to the frontend pair. The first sketches of the same screens are on [Early sketches](#sketches). All names are invented. <!-- modified 2026-10-08 04:15 Aisling -->

## Walkthrough videos
<!-- new 2026-10-09 06:10 Aisling -->

The whole path through all three apps, recorded October 9 on the "Full gala, fixed" invented data: a sponsor's private link, naming a guest, the staff dashboard and guest list, a sponsor's page and a check payment, the approval list, badges, the printed check-in list, and the iPad at the door (search, QR e-ticket, walk-in). AAFE's logo and event photos are grey placeholders (hard rule 8). <!-- new 2026-10-09 06:10 Aisling -->

<video controls playsinline preload="metadata" poster="img/demo-walkthrough.jpg" src="img/demo-walkthrough.mp4" aria-label="Three-minute narrated walkthrough of the sponsor portal, the staff app, and the iPad check-in app"></video>

*About three minutes, narrated, with a caption on each step. The voice was made on a team laptop with an open-source voice (Kokoro); nothing was sent anywhere.* <!-- new 2026-10-09 06:10 Aisling -->

<video controls muted playsinline preload="metadata" poster="img/demo-walkthrough-short.jpg" src="img/demo-walkthrough-short.mp4" aria-label="90-second walkthrough with captions, no sound"></video>

*The same path in 90 seconds, captions only.* <!-- new 2026-10-09 06:10 Aisling -->

## The build so far
<!-- new 2026-10-06 05:45 Aisling -->

Screens from Natalie's staff app and sponsor portal, captured October 6, before staff sign-in (PR #27), Korean in the portal (PR #51), and the demo data picker (PR #66). AAFE's logo and event photos are swapped for grey placeholders until AAFE approves them for public use in writing (hard rule 8). <!-- modified 2026-10-08 04:15 Aisling -->

<!-- removed 2026-10-09 06:10 Aisling The 25-second walkthrough from Oct 6: replaced by the two walkthrough videos above -->

### Sponsor portal

A sponsor opens the private link from their email. No account needed.

![Sponsor portal welcome page for an invented sponsor, Acme Community Partners, showing its Silver sponsorship and the gala date](img/portal-welcome.jpg)

Naming a guest for an open seat. The change is saved with the date and time, and staff see it right away.

![Animation: the sponsor opens seat 6, fills in an invented guest's name, title, and organization, saves, and the seat and activity log update](img/portal-add-guest.gif)

### Staff app

The dashboard answers the intake form's questions: what's committed and received, how many seats are named, and who needs follow-up.

![Staff dashboard with totals for commitments, payments, named seats, staff review, and a follow-up list by sponsor](img/staff-dashboard.jpg)

One sponsorship: its seats, payment balance, logo and program-ad status, and giving history.

![Sponsorship detail for Acme Community Partners with seats, statuses, payments, and sponsor materials](img/staff-sponsor-order.jpg)

The guest list, editable like a spreadsheet, with every change timestamped.

![Guest list table with sponsor, name, title, organization, and email columns](img/staff-guest-list.jpg)

Badges fill in from the guest list, with table and seat.

![Badge previews for invented guests, each with title, organization, table and seat, and sponsor line](img/staff-badges.jpg)

The three files staff download, each checked against the person's role and logged (October 9): CSV for the printer on Badges, a printed check-in list on Check-in, in case the venue's internet fails, and the attendee file for Salesforce on Integrations. <!-- new 2026-10-09 06:10 Aisling -->

![Check-in page with a Printed check-in list button next to the arrived count](img/staff-checkin-export.jpg)

![Salesforce card on the Integrations page with Sync now (simulated) and Download Salesforce file buttons](img/staff-salesforce-export.jpg)

### Check-in in the staff app

Staff can search a name or sponsor and mark the guest arrived. At the door, volunteers use the iPad app below. <!-- modified 2026-10-08 04:15 Aisling -->

![Animation: staff search "Acme" on the check-in screen and mark an invented guest, Jordan Lee, as arrived at table 5](img/check-in.gif)

## iPad check-in app
<!-- new 2026-10-08 04:15 Aisling -->

Natalie's app for volunteers at the door (`prototype/checkin-app/`, PR #56), on the Full gala's 553 invented guests, retaken October 9 with the larger logo mark (PR #81) and, in portrait, the All / Not checked in / Checked in filter on its own row (PRs #81, #82). Volunteers sign in with a check-in-only role; the app shows tonight's gala only, keeps working offline, and syncs later. AAFE's logo mark is a grey placeholder (hard rule 8). <!-- modified 2026-10-09 00:05 Aisling -->

The guest list, A to Z by last name, with each guest's category, seat, and table.

![iPad check-in app: the guest list for AAFE's 53rd Annual Gala, 1 of 553 checked in, with category tabs, search, Scan and Exception buttons, and invented guests from Abbott to Acosta](img/ipad-guest-list.jpg)

Several guests checked in at once, with the count and each category's progress updated.

![iPad check-in app after checking in several invented guests at 9:37 PM, with the counts updated](img/ipad-checked-in.jpg)

Scanning a QR e-ticket. When the camera isn't allowed, the volunteer types the code printed under the QR.

![The Scan QR code window with an invented code typed in and a Check in button](img/ipad-qr.jpg)

The same ticket scanned twice: the app says who checked it in, when, and by whom.

![The Scan QR code window warning that an invented guest, Eddie Chan, was already checked in at 9:38 PM by Kenji Abe](img/ipad-repeat-scan.jpg)

Exceptions, such as a walk-in, are recorded with a note and listed for the check-in lead.

![The exceptions list with an invented walk-in](img/ipad-exceptions.jpg)

The same app held upright. The filter moves to its own row, and Tab follows the screen from top to bottom (PR #82). <!-- modified 2026-10-09 00:05 Aisling -->

![iPad check-in app in portrait, 12 of 553 checked in, with the filter on its own row under search, Scan and Exception](img/ipad-portrait.jpg)
