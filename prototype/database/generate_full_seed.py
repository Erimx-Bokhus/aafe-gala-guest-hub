#!/usr/bin/env python3
"""
The two Full demo data sets (decided Oct 7: three labeled sets, one loaded at a time).

Both are built around the iPad app's door list (checkin-app/src/doorlist.json, 553 invented guests,
151 orders, 21 tables) and keep its guest ids, names, categories, tables and QR codes, so the staff app,
the sponsor portal and the iPad app show the same people. The first 48 guests and their orders are the
Small set's (seed.json), kept as they are.

  full-as-sent  Natalie's shape as she sent it: her package names, seat counts and prices; her 21-table
                layout; readable sponsor links; emails marked sent with no approval record.
  full-fixed    The same gala with the team's fixes: the 2026 flyer's seat counts and prices, random
                192-bit sponsor links, and a staff approval on every email that was sent.

Run after generate_seed.py (npm run seed runs both). Outputs, for each set:
  ../shared/src/seed.<set>.json   the apps' data, picked with the demo-data switch
  ./seed.<set>.sql                load with: npm run db:load -- <set>   (needs backend.sql loaded first)
Every person, organization, email and payment is FICTIONAL. Same inputs give the same files byte for byte.
"""
import copy, json, os, random, re, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SMALL = json.load(open(os.path.join(ROOT, 'shared', 'src', 'seed.json'), encoding='utf-8'))
DOOR = json.load(open(os.path.join(ROOT, 'checkin-app', 'src', 'doorlist.json'), encoding='utf-8'))
CUR = SMALL['meta']['current_event_id']

# 2026 flyer (decision Oct 5): price and seats. Friend and Supporter are admittance only.
FLYER = {'platinum': (50000, 12), 'gold': (30000, 10), 'silver': (25000, 10), 'bronze': (15000, 8),
         'champion': (7500, 6), 'friend': (2500, 2), 'supporter': (1000, 1)}
PACKAGE_TIER = {'Platinum': 'platinum', 'Gold': 'gold', 'Silver': 'silver', 'Bronze': 'bronze', 'Champion': 'champion',
                'Friend Sponsor': 'friend', 'Supporter Sponsor': 'supporter', 'Corporate Ticket': 'corporate_ticket',
                'Community Ticket': 'community_ticket'}
INTERNAL = {  # door-list orders that aren't purchases: (sponsor id, organization, note)
    'ord-govvip': ('sp-aafe-rel', None, 'Government and VIP invitations, issued by AAFE.'),
    'ord-staff': ('sp-aafe-internal', 'AAFE staff and event team (internal)', 'AAFE staff attending the gala.'),
    'ord-volunteers': ('sp-aafe-internal', None, 'Event-night volunteers.'),
    'ord-eventstaff': ('sp-aafe-internal', None, 'Event staff (photographer, AV).'),
}
RMS = ['st-daniel', 'st-priya', 'st-grace', 'st-mei']
STAFF_NAME = {s['id']: s['name'] for s in SMALL['staff_users']}


# Same rule as generate_seed.py: most guests with no need answered "None"; about 1 in 7 hasn't answered yet.
def answered_none(guest_id, what):
    return 'None' if zlib.crc32(f'{what}-{guest_id}'.encode()) % 100 < 85 else None

def money(x): return round(x + 1e-9, 2)


def fee(method, gross):
    if method == 'card': return money(gross * 0.022 + 0.30)
    if method == 'amex': return money(gross * 0.035)
    if method == 'givelively_ach': return money(min(gross * 0.008, 5.0))
    return 0.0


def payment(rng, pid, order_id, method, original, received_at, covered=False, recorded_by='givelively_sync', check_no=None, sf=None, recon='matched'):
    covered_amt = fee(method, original) if covered and method in ('card', 'amex', 'givelively_ach') else 0.0
    gross = money(original + covered_amt)
    f = fee(method, gross)
    return dict(id=pid, order_id=order_id, method=method, processor='stripe' if method in ('card', 'amex', 'givelively_ach') else 'none',
                givelively_transaction_id=f'GL-{rng.randint(10**7, 10**8 - 1)}' if method in ('card', 'amex', 'givelively_ach') else None,
                check_number=check_no, original_amount=money(original), covered_fee_amount=covered_amt, gross_amount=gross,
                transaction_fee_amount=f, refunded_amount=0.0, net_amount=money(gross - f), received_at=received_at,
                recorded_by=recorded_by, reconciliation_status=recon, salesforce_opportunity_id=sf)


def slug(s): return re.sub(r'[^a-z0-9]+', '', s.lower().replace('(synthetic)', ''))[:24] or 'org'


def guest_email(first, last):
    # Same rule as generate_seed.py's guests: first.last@guest.example.org, accents dropped.
    e = f'{first}.{last}'.lower().replace(' ', '').replace('.', '', first.count('.'))
    for a, b in (('é', 'e'), ('á', 'a'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ñ', 'n'), ('ü', 'u'), ('’', ''), ("'", '')):
        e = e.replace(a, b)
    local = re.sub(r'[^a-z0-9.\-]', '', e).strip('.')
    return (local or 'guest') + '@guest.example.org'   # names in other scripts fall back to 'guest'


def readable_link(rng, name, used):
    # Natalie's style: the organization's initials, a dash, 8 characters (hard rule 6 says no; kept as sent).
    words = re.findall(r'[A-Za-z]+', name.replace('(synthetic)', ''))
    pre = ((words[0][0] + words[1][0]) if len(words) > 1 else (words[0] + 'x')[:2] if words else 'xx').lower()
    while True:
        t = pre + '-' + ''.join(rng.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(8))
        if t not in used: used.add(t); return t


def random_link(rng, used):
    # 192 random bits, base64url (decision Oct 8), like the links the email sender mints.
    import base64
    while True:
        t = base64.urlsafe_b64encode(rng.getrandbits(192).to_bytes(24, 'big')).decode().rstrip('=')
        if t not in used: used.add(t); return t


def build(name):
    fixed = name == 'full-fixed'
    # Both Full sets are the same gala: each order's and guest's random choices come from a stream named after it,
    # shared by the two sets. Only the sponsor links are drawn per set.
    link_rng = random.Random(f'aafe-{name}-links')
    data = copy.deepcopy(SMALL)
    data['meta'] = dict(data['meta'], dataset=name, dataset_label={'full-as-sent': 'Full gala, as sent', 'full-fixed': 'Full gala, fixed'}[name],
                        dataset_note={'full-as-sent': "553 invented guests in Natalie's shape: her packages, seat counts and 21 tables; emails sent without an approval record.",
                                      'full-fixed': "553 invented guests with the team's fixes: 2026 flyer seat counts and prices, random sponsor links, every sent email approved by staff."}[name])

    tiers = {t['id']: t for t in data['sponsorship_tiers']}
    if fixed:
        for tid, (price, seats) in FLYER.items():
            tiers[tid]['contribution_amount'], tiers[tid]['included_seat_count'] = price, seats

    small_cur = [o for o in data['orders'] if o['event_id'] == CUR]
    history = [o for o in data['orders'] if o['event_id'] != CUR]
    by_order = {}
    for g in DOOR['guests']:
        by_order.setdefault(g['order_id'], []).append(g)
    door_name = {s['order_id']: s['name'] for s in DOOR['sponsors']}

    # ---- sponsors and orders: the Small set's, then one per door-list order it doesn't have
    sponsors = {s['id']: s for s in data['sponsors']}
    orders = {o['id']: o for o in small_cur}
    phones = iter(list(range(100, 200)) * 3)
    sponsors['sp-aafe-internal'] = dict(id='sp-aafe-internal', organization_name='AAFE staff and event team (internal)', primary_contact_name='AAFE Gala Team',
                                        primary_contact_email='gala-team@aafe-demo.example.org', phone=None, relationship_owner_id='st-mei',
                                        salesforce_account_id=None, created_at='2024-01-15T15:00:00Z')
    for i, (oid, gs) in enumerate(by_order.items()):
        if oid in orders:
            continue
        if oid in INTERNAL:
            sp_id, _, note = INTERNAL[oid]
            orders[oid] = dict(id=oid, event_id=CUR, sponsor_id=sp_id, tier_id='comp_relationship', source='comp', commitment_amount=0, status='comp',
                               portal_token=None, portal_token_expires_at=None, portal_link_sent_at=None, guest_list_deadline='2027-04-23',
                               logo_status='not_required', program_ad_status='not_required', givelively_order_ref=None, salesforce_opportunity_id=None,
                               internal_notes=note, created_at='2026-09-01T12:00:00Z', updated_at='2026-09-01T12:00:00Z')
            continue
        tier = PACKAGE_TIER[gs[0]['package']]
        org = door_name.get(oid) or gs[0]['sponsor'] or gs[0]['organization']
        contact = gs[0]
        sp_id = 'sp-' + oid[4:]
        rng = random.Random(f'aafe-full-{oid}')
        sponsors[sp_id] = dict(id=sp_id, organization_name=org, primary_contact_name=f"{contact['first_name']} {contact['last_name']}",
                               primary_contact_email=guest_email(contact['first_name'], contact['last_name']).replace('@guest.example.org', f'@{slug(org)}.example.org'),
                               phone=f'(212) 555-{next(phones):04d}', relationship_owner_id=RMS[i % len(RMS)],
                               salesforce_account_id=f'001DEMO{oid[4:].upper():0>8}'[:15] if rng.random() < 0.5 else None, created_at='2024-01-15T15:00:00Z')
        ticket = tier.endswith('_ticket')
        day = 1 + rng.randrange(60)
        created = f'2026-{8 + day // 31:02d}-{1 + day % 30:02d}T{13 + rng.randrange(7):02d}:{rng.randrange(60):02d}:00Z'
        roll = rng.random()
        status = 'paid' if ticket or roll < 0.6 else ('partially_paid' if roll < 0.8 else 'pledged')
        source = 'givelively' if ticket or (status == 'paid' and rng.random() < 0.6) else rng.choice(['check', 'ach_direct', 'wire'])
        mats = tiers[tier]['required_materials']
        orders[oid] = dict(id=oid, event_id=CUR, sponsor_id=sp_id, tier_id=tier, source=source, commitment_amount=0, status=status,
                           portal_token='', portal_token_expires_at='2027-05-21T04:00:00Z', portal_link_sent_at=created[:11] + '20:30:00Z',
                           guest_list_deadline='2027-04-23',
                           logo_status=rng.choice(['pending', 'received', 'approved']) if 'logo' in mats else 'not_required',
                           program_ad_status=rng.choice(['pending', 'received', 'approved']) if any('ad' in m for m in mats) else 'not_required',
                           givelively_order_ref=None, salesforce_opportunity_id=None, internal_notes='', created_at=created, updated_at=created)

    # ---- seats per order, commitments, and sponsor links
    seat_counts = {}
    used = set()
    for o in orders.values():
        t = tiers[o['tier_id']]
        n_guests = len(by_order.get(o['id'], []))
        if o['tier_id'] in ('corporate_ticket', 'community_ticket'):
            seat_counts[o['id']] = max(1, n_guests)                                 # one seat per ticket bought
            o['commitment_amount'] = t['contribution_amount'] * seat_counts[o['id']]
        elif o['tier_id'] == 'comp_relationship':
            seat_counts[o['id']] = n_guests
        else:
            seat_counts[o['id']] = max(t['included_seat_count'], n_guests)
            o['commitment_amount'] = t['contribution_amount']
        if o['portal_token'] is not None:
            o['portal_token'] = random_link(link_rng, used) if fixed else (o['portal_token'] or readable_link(link_rng, sponsors[o['sponsor_id']]['organization_name'], used))
            used.add(o['portal_token'])

    # ---- payments: the Small set's past galas as they are; this gala's follow each order's commitment
    small_pay = {p['order_id']: p for p in data['payments'] if p['order_id'] in orders}
    payments = [p for p in data['payments'] if p['order_id'] not in orders]
    for o in orders.values():
        if o['status'] not in ('paid', 'partially_paid'):
            continue
        amount = o['commitment_amount'] if o['status'] == 'paid' else money(o['commitment_amount'] / 2)
        pay_rng = random.Random(f"aafe-full-pay-{o['id']}")
        old = small_pay.get(o['id'])
        if old and not fixed:
            payments.append(old)
            continue
        if old:
            p = payment(pay_rng, old['id'], o['id'], old['method'], amount, old['received_at'], covered=old['covered_fee_amount'] > 0,
                        recorded_by=old['recorded_by'], check_no=old['check_number'], sf=old['salesforce_opportunity_id'], recon=old['reconciliation_status'])
            p['givelively_transaction_id'] = old['givelively_transaction_id']
        else:
            method = pay_rng.choice(['card', 'card', 'amex', 'givelively_ach']) if o['source'] == 'givelively' else o['source']
            p = payment(pay_rng, f"pay-{o['id'][4:]}-1", o['id'], method, amount, o['created_at'], covered=pay_rng.random() < 0.4,
                        recorded_by='givelively_sync' if o['source'] == 'givelively' else RMS[0],
                        check_no=str(4000 + pay_rng.randrange(900)) if method == 'check' else None)
            if o['source'] == 'givelively':
                o['givelively_order_ref'] = p['givelively_transaction_id']
        payments.append(p)

    # ---- past galas (AAFE's Oct 20 walk-through, 9:35): the Small set's 12 past orders alone left 150 of this gala's sponsors
    # blank under "Last two galas" and made past galas look tiny beside this one. Most returning sponsors now gave in 2026 and
    # some in 2025, at the same level or one below (the levels those galas had), paid in full before the gala.
    PAST = {'ev-2026': ('26', 0.65, {'platinum': ['platinum-2026', 'gold-2026'], 'gold': ['gold-2026', 'silver-2026'], 'silver': ['silver-2026', 'champion-2026'],
                                      'bronze': ['silver-2026', 'champion-2026'], 'champion': ['champion-2026', 'friend-2026'],
                                      'friend': ['friend-2026', 'supporter-2026'], 'supporter': ['supporter-2026', 'friend-2026']}),
            'ev-2025': ('25', 0.45, {'platinum': ['gold-2025'], 'gold': ['gold-2025', 'bronze-2025'], 'silver': ['bronze-2025'], 'bronze': ['bronze-2025', 'friend-2025'],
                                      'champion': ['friend-2025'], 'friend': ['friend-2025'], 'supporter': ['friend-2025']})}
    had = {(o['sponsor_id'], o['event_id']) for o in history}
    for o in sorted(orders.values(), key=lambda x: x['id']):
        if o['tier_id'] not in PAST['ev-2026'][2] or o['sponsor_id'].startswith('sp-aafe'):
            continue
        h_rng = random.Random(f"aafe-full-history-{o['sponsor_id']}")
        for ev, (yy, share, levels) in PAST.items():
            if (o['sponsor_id'], ev) in had or h_rng.random() >= share:
                continue
            had.add((o['sponsor_id'], ev))
            tier = tiers[h_rng.choice(levels[o['tier_id']])]
            hid = f"ord-{yy}-{o['id'][4:]}"
            created = f"20{yy}-{2 + h_rng.randrange(3):02d}-{1 + h_rng.randrange(28):02d}T15:00:00Z"
            source = h_rng.choice(['check', 'check', 'ach_direct', 'wire', 'givelively'])
            sf_id = f"006DEMO{yy[-1]}-{o['id'][4:].upper()}"
            mats = tier['required_materials']
            past = dict(id=hid, event_id=ev, sponsor_id=o['sponsor_id'], tier_id=tier['id'], source=source, commitment_amount=tier['contribution_amount'], status='paid',
                        portal_token=None, portal_token_expires_at=None, portal_link_sent_at=None, guest_list_deadline=None,
                        logo_status='approved' if 'logo' in mats else 'not_required', program_ad_status='approved' if any('ad' in m for m in mats) else 'not_required',
                        givelively_order_ref=None, salesforce_opportunity_id=sf_id, internal_notes='Historical (synthetic).', created_at=created, updated_at=created)
            method = h_rng.choice(['card', 'givelively_ach']) if source == 'givelively' else source
            pay = payment(h_rng, f'pay-{hid}', hid, method, tier['contribution_amount'], created, recorded_by='givelively_sync' if source == 'givelively' else 'st-mei',
                          check_no=str(3000 + h_rng.randrange(900)) if method == 'check' else None, sf=sf_id)
            if source == 'givelively':
                past['givelively_order_ref'] = pay['givelively_transaction_id']
            history.append(past)
            payments.append(pay)

    # ---- tables: the door list's 21
    tables = []
    for n in range(1, 22):
        tables.append(dict(id=f'tb-{n}', event_id=CUR, number=n, label={1: 'Head table', 2: 'Harborline', 3: 'Harborline', 4: 'Meridian', 5: 'Acme', 6: 'Pacific Rim'}.get(n),
                           capacity=10, pos_x=12 + ((n - 1) % 7) * 13, pos_y=25 + ((n - 1) // 7) * 25))

    # ---- guests and seats: the Small set's 48 as they are; the rest from the door list
    small_guests = {g['id']: g for g in data['guests']}
    small_seats = {s['guest_id']: s for s in data['seats'] if s['guest_id']}
    notes = ['Longtime community partner', 'Board referral', 'Elected-official staff', 'Program alumnus', 'Partner organization', 'Funder relationship']
    guests, seats = [], []
    for oid, gs in by_order.items():
        for slot, d in enumerate(gs, 1):
            if d['id'] in small_guests:
                # The Small set's guest as is, but with the door list's QR code, so the iPad scans the same ticket.
                guests.append(dict(small_guests[d['id']], qr_token=d['qr_token']))
                seats.append(small_seats[d['id']])
                continue
            g_rng = random.Random(f"aafe-full-{d['id']}")
            seated = d['table'] is not None
            status = (g_rng.choice(['badge_ready', 'badge_ready', 'reviewed']) if seated else g_rng.choice(['reviewed', 'submitted', 'submitted']))
            by = 'guest_portal' if d['category_key'] in ('sponsor_guest', 'ticket_holder') and status == 'submitted' else 'staff'
            when = f'2026-09-{10 + g_rng.randrange(19):02d}T{14 + g_rng.randrange(6):02d}:{g_rng.randrange(60):02d}:00Z'
            g = dict(id=d['id'], order_id=oid, first_name=d['first_name'], last_name=d['last_name'], title=d['title'], organization=d['organization'],
                     email=guest_email(d['first_name'], d['last_name']),
                     # Need names from shared/src/guestNeeds.ts; most guests without a need answered "None" (answered_none).
                     dietary_needs=(g_rng.choice(['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'No shellfish', 'Gluten-free']) if g_rng.random() < 0.12 else None) or answered_none(d['id'], 'food'),
                     accessibility_needs=(g_rng.choice(['Step-free access', 'Wheelchair access', 'Hearing support']) if g_rng.random() < 0.04 else None) or answered_none(d['id'], 'access'),
                     guest_type=d['category_key'], relationship_note=g_rng.choice(notes) if d['category_key'] == 'comp_relationship' else None,
                     table_id=f"tb-{d['table']}" if seated else None, seat_number=d['seat'],
                     badge_status='ready' if status == 'badge_ready' else 'needs_review', attendance_status='expected', qr_token=d['qr_token'],
                     last_updated_by=by, created_at=when, updated_at=when)
            guests.append(g)
            seats.append(dict(id=f'seat-{oid}-{slot}', order_id=oid, slot_number=slot, guest_id=g['id'], status=status, updated_at=when))
    for o in orders.values():
        named = len(by_order.get(o['id'], []))
        for slot in range(named + 1, seat_counts[o['id']] + 1):
            seats.append(dict(id=f"seat-{o['id']}-{slot}", order_id=o['id'], slot_number=slot, guest_id=None, status='unnamed', updated_at=o['created_at']))

    # Arrivals on the door list (rehearsal check-ins), as in the Small set
    check_ins = copy.deepcopy(data['check_ins'])
    arrived = {c['guest_id'] for c in check_ins if c['guest_id']}
    for g in guests:
        if g['id'] in arrived: g['attendance_status'] = 'checked_in'
    for s in seats:
        if s['guest_id'] in arrived: s['status'] = 'checked_in'

    # ---- emails: sponsor links, QR invitations, one reminder draft
    emails = []
    def email(template, to, to_name, oid=None, gid=None, trigger='staff_manual', status='sent', at=None, owner=None):
        e = dict(id=f'em-{len(emails) + 1:03d}', template=template, to_email=to, to_name=to_name, order_id=oid, guest_id=gid, trigger=trigger, status=status, sent_at=at)
        # As sent: emails went out with no approval record. Fixed: every sent email has a staff approval just before it.
        approved = fixed and status != 'queued'
        e['approved_by'] = STAFF_NAME[owner or 'st-mei'] if approved else None
        e['approved_at'] = (at[:14] + f'{max(0, int(at[14:16]) - 10):02d}' + at[16:]) if approved and at else None
        emails.append(e)
    for o in sorted(orders.values(), key=lambda o: (o['created_at'], o['id'])):
        if o['portal_token']:
            sp = sponsors[o['sponsor_id']]
            email('portal_link', sp['primary_contact_email'], sp['primary_contact_name'], o['id'],
                  trigger='givelively_sync' if o['source'] == 'givelively' else 'payment_recorded', status='opened', at=o['portal_link_sent_at'], owner=sp['relationship_owner_id'])
    for g in guests:
        if g['qr_token']:
            queued = g['last_name'] == 'Fong'
            email('qr_invitation', g['email'], f"{g['first_name']} {g['last_name']}", g['order_id'], g['id'], status='queued' if queued else 'sent', at=None if queued else '2026-09-03T14:00:00Z')
    acme = sponsors['sp-acme']
    email('guest_list_reminder', acme['primary_contact_email'], acme['primary_contact_name'], 'ord-acme', trigger='scheduled', status='queued')

    # ---- activity log, the same events the Small set records, for every order
    audit = []
    def log(at, actor_type, actor, entity, entity_id, oid, action, summary, frm=None, to=None, visible=False):
        audit.append(dict(at=at, actor_type=actor_type, actor=actor, entity=entity, entity_id=entity_id, order_id=oid, action=action, from_state=frm, to_state=to, guest_visible=visible, summary=summary))
    for o in orders.values():
        sp = sponsors[o['sponsor_id']]
        log(o['created_at'], 'system' if o['source'] == 'givelively' else 'staff', 'Give Lively sync' if o['source'] == 'givelively' else 'Mei Lin Ortiz', 'order', o['id'], o['id'],
            'order.created', f"{tiers[o['tier_id']]['name']} recorded for {sp['organization_name']} ({o['source']}).", None, o['status'], visible=o['tier_id'] != 'comp_relationship')
    for p in payments:
        if p['order_id'] in orders:
            log(p['received_at'], 'system' if p['recorded_by'] == 'givelively_sync' else 'staff', 'Give Lively sync' if p['recorded_by'] == 'givelively_sync' else 'Staff', 'payment', p['id'], p['order_id'],
                'payment.recorded', f"Payment received: ${p['gross_amount']:,.2f}.", visible=True)
    for e in emails:
        if e['approved_by']:
            log(e['approved_at'], 'staff', e['approved_by'], 'email', e['id'], e['order_id'], 'email.approved', f"{e['template'].replace('_', ' ').capitalize()} email approved.")
    for o in orders.values():
        if o['portal_link_sent_at']:
            log(o['portal_link_sent_at'], 'system', 'Email service', 'email', o['id'], o['id'], 'portal_link.sent', 'Private guest-list link emailed.', visible=True)
    seat_of = {s['guest_id']: s for s in seats if s['guest_id']}
    for g in guests:
        s = seat_of[g['id']]
        log(g['created_at'], 'guest_portal' if g['last_updated_by'] == 'guest_portal' else 'staff', 'Guest portal' if g['last_updated_by'] == 'guest_portal' else 'Staff',
            'guest', g['id'], g['order_id'], 'guest.submitted', f"{g['first_name']} {g['last_name']} added to seat {s['slot_number']}.", 'unnamed', 'submitted', visible=True)
        if s['status'] in ('reviewed', 'badge_ready', 'checked_in'):
            log(g['created_at'][:11] + '20:00:00Z', 'staff', 'Priya Raman', 'seat', s['id'], g['order_id'], 'seat.reviewed', f"{g['first_name']} {g['last_name']} confirmed by AAFE.", 'submitted', 'reviewed', visible=True)
    audit.sort(key=lambda a: (a['at'], a['entity'], a['entity_id'], a['action']))
    for i, a in enumerate(audit, 1): a['id'] = i

    # ---- Salesforce map
    sf = [dict(entity='sponsor', entity_id=s['id'], sf_object='Account', sf_id=s['salesforce_account_id'], status='synced' if s['salesforce_account_id'] else 'pending',
               last_synced_at='2026-09-30T13:30:00Z' if s['salesforce_account_id'] else None, error_message=None) for s in sponsors.values()]
    sf += [dict(entity='payment', entity_id=p['id'], sf_object='Opportunity', sf_id=p['salesforce_opportunity_id'], status='synced' if p['salesforce_opportunity_id'] else 'pending',
                last_synced_at='2026-09-30T13:30:00Z' if p['salesforce_opportunity_id'] else None, error_message=None) for p in payments]

    data.update(sponsorship_tiers=list(tiers.values()), sponsors=list(sponsors.values()), orders=list(orders.values()) + history, payments=payments,
                event_tables=tables, guests=guests, seats=seats, check_ins=check_ins, email_log=emails, audit_log=audit, salesforce_sync=sf, seat_counts=seat_counts)
    return data


def lit(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "'{" + ','.join(v) + "}'"
    return "'" + str(v).replace("'", "''") + "'"


TABLES = ['gala_events', 'staff_users', 'sponsorship_tiers', 'sponsors', 'orders', 'payments', 'event_tables', 'guests', 'seats', 'check_ins', 'email_log', 'audit_log', 'salesforce_sync']

for name in ('full-as-sent', 'full-fixed'):
    data = build(name)
    with open(os.path.join(ROOT, 'shared', 'src', f'seed.{name}.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    with open(os.path.join(HERE, f'seed.{name}.sql'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(f"-- SYNTHETIC DEMO DATA: {data['meta']['dataset_label']} (generated by generate_full_seed.py)\n"
                f"-- {data['meta']['dataset_note']}\n-- All people, organizations, emails and payments are fictional.\n"
                f"-- Load with: npm run db:load -- {name}   (clears the demo tables first; needs backend.sql loaded)\nbegin;\n")
        for t in TABLES:
            rows = data[t]
            cols = list(rows[0].keys())
            f.write(f'\n-- {t} ({len(rows)} rows)\n')
            for r in rows:
                f.write(f"insert into {t} ({', '.join(cols)}) values ({', '.join(lit(r.get(c)) for c in cols)});\n")
        f.write('\ncommit;\n')
    cur = [o for o in data['orders'] if o['event_id'] == CUR]
    print(name, 'orders', len(cur), 'guests', len(data['guests']), 'seats', len(data['seats']), 'payments', len(data['payments']),
          'emails', len(data['email_log']), 'audit', len(data['audit_log']))
