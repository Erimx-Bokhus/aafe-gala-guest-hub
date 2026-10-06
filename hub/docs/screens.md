# Screens

Rough sketches of the three screens AAFE asked for, to agree on what each one shows. Layout and visual design belong to the frontend pair; Natalie's staff app and portal in `prototype/` are now the real designs (see The build so far below), and these sketches are kept for the questions at the end. All names are invented. <!-- modified 2026-10-06 05:50 Aisling -->

## The build so far
<!-- new 2026-10-06 05:45 Aisling -->

Screens from Natalie's staff app and sponsor portal in `prototype/`, running on invented demo data, captured October 6. AAFE's logo and event photos are swapped for grey placeholders until AAFE approves them for public use in writing (hard rule 8).

<video controls muted playsinline preload="metadata" poster="img/portal-welcome.jpg" src="img/build-walkthrough.mp4" aria-label="25-second walkthrough: the sponsor portal, the staff app, and check-in"></video>

*A 25-second walkthrough: a sponsor names a guest, staff see it, badges fill in, and the guest checks in.*

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

### Check-in

Search a name or sponsor at the door and mark the guest arrived.

![Animation: staff search "Acme" on the check-in screen and mark an invented guest, Jordan Lee, as arrived at table 5](img/check-in.gif)

## Staff dashboard
<!-- modified 2026-10-05 16:51 Aisling -->

Answers the intake form's three questions: who is coming and what's missing, who owns each guest, and how we're tracking to goal.

```wireframe dashboard
```

```notes
Every number on this screen comes from one query: open seats grouped by relationship owner. The goal bars are placeholders until AAFE shares targets.
```

## Sponsor guest form
<!-- modified 2026-10-05 16:51 Aisling -->

Opened from a private link on a phone or laptop. Shows exactly as many slots as the package includes, and stays editable until AAFE's deadline.

```wireframe sponsor
```

## Check-in

On an iPad at the door. Search by guest or sponsor, mark arrivals, and handle walk-ins and unnamed sponsor seats.

```wireframe checkin
```

```notes
This replaces the printed spreadsheet and the slow line. It has to keep working if the venue's internet drops.
```

## Open questions for the sketches

- What goals does AAFE track per category: sponsorship dollars, tickets sold, attendance?
- Does the sponsor form need logo upload, or does logo collection stay in email?
- Who uses check-in: staff only, or volunteers too? That decides the "check-in" role's limits.
