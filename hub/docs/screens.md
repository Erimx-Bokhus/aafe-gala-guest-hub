# Live build
<!-- modified 2026-10-08 08:15 Aisling Split: the sketches moved to Early sketches; the iPad check-in app added -->
<!-- reviewed 2026-10-08 Aisling -->

The real apps in `prototype/`, running on invented demo data: Natalie's sponsor portal and staff app, and her iPad check-in app for the door. Layout and visual design belong to the frontend pair. The first sketches of the same screens are on [Early sketches](#sketches). All names are invented. <!-- modified 2026-10-08 08:15 Aisling -->

## The build so far
<!-- new 2026-10-06 05:45 Aisling -->

Screens from Natalie's staff app and sponsor portal, captured October 6, before staff sign-in (PR #27), Korean in the portal (PR #51), and the demo data picker (PR #66). AAFE's logo and event photos are swapped for grey placeholders until AAFE approves them for public use in writing (hard rule 8). <!-- modified 2026-10-08 08:15 Aisling -->

<video controls muted playsinline preload="metadata" poster="img/portal-welcome.jpg" src="img/build-walkthrough.mp4" aria-label="25-second walkthrough: the sponsor portal, the staff app, and check-in"></video>

*A 25-second walkthrough: a sponsor names a guest, staff see it, badges fill in, and the guest checks in on the staff app's check-in screen.* <!-- modified 2026-10-08 08:15 Aisling -->

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

### Check-in in the staff app

Staff can search a name or sponsor and mark the guest arrived. At the door, volunteers use the iPad app below. <!-- modified 2026-10-08 08:15 Aisling -->

![Animation: staff search "Acme" on the check-in screen and mark an invented guest, Jordan Lee, as arrived at table 5](img/check-in.gif)

## iPad check-in app
<!-- new 2026-10-08 08:15 Aisling -->

Natalie's app for volunteers at the door (`prototype/checkin-app/`, PR #56), on the Full gala's 553 invented guests, captured October 8. Volunteers sign in with a check-in-only role; the app shows tonight's gala only, keeps working offline, and syncs later. AAFE's logo mark is a grey placeholder (hard rule 8).

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

The same app held upright.

![iPad check-in app in portrait, 12 of 553 checked in](img/ipad-portrait.jpg)
