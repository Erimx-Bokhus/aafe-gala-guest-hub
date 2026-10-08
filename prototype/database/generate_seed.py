#!/usr/bin/env python3
"""
Synthetic data generator for the AAFE Gala Guest Operations apps.
Every person, organization, email, payment and note is FICTIONAL.
Outputs:
  ../shared/seed.json   -> consumed by both front-end apps
  ./seed.sql            -> load into Postgres / Supabase after schema.sql
Fee math follows Give Lively's published third-party (Stripe) nonprofit rates:
  card 2.2% + $0.30 | Amex 3.5% | Give Lively ACH 0.8% capped at $5 | offline (check/direct ACH/wire) $0
"""
import json, random, os
from datetime import datetime, timedelta, timezone

random.seed(2027)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_JSON = os.path.join(HERE, '..', 'shared', 'src', 'seed.json')
OUT_SQL = os.path.join(HERE, 'seed.sql')

def ts(s): return s  # ISO strings with Z
def money(x): return round(x + 1e-9, 2)

def fee(method, gross):
    if method == 'card': return money(gross * 0.022 + 0.30)
    if method == 'amex': return money(gross * 0.035)
    if method == 'givelively_ach': return money(min(gross * 0.008, 5.0))
    return 0.0

def make_payment(pid, order_id, method, original, received_at, covered=False, recorded_by='givelively_sync', check_no=None, sf=None, recon='matched'):
    covered_amt = fee(method, original) if covered and method in ('card', 'amex', 'givelively_ach') else 0.0
    gross = money(original + covered_amt)
    f = fee(method, gross)
    return dict(id=pid, order_id=order_id, method=method,
                processor='stripe' if method in ('card', 'amex', 'givelively_ach') else 'none',
                givelively_transaction_id=f'GL-{random.randint(10**7, 10**8-1)}' if method in ('card', 'amex', 'givelively_ach') else None,
                check_number=check_no, original_amount=money(original), covered_fee_amount=covered_amt,
                gross_amount=gross, transaction_fee_amount=f, refunded_amount=0.0, net_amount=money(gross - f),
                received_at=received_at, recorded_by=recorded_by, reconciliation_status=recon,
                salesforce_opportunity_id=sf)

events = [
    dict(id='ev-2024', year=2024, name='AAFE 50th Anniversary Gala', event_date='2024-05-30', doors_time='6:00 PM', program_time='7:15 PM', venue_name='Synthetic venue', venue_address='New York, NY', dress_code='Cocktail', guest_list_deadline='2024-05-10', program_ad_deadline='2024-05-01', status='closed', is_synthetic=True),
    dict(id='ev-2025', year=2025, name='AAFE 51st Annual Gala', event_date='2025-05-22', doors_time='6:00 PM', program_time='7:15 PM', venue_name='Synthetic venue', venue_address='New York, NY', dress_code='Cocktail', guest_list_deadline='2025-05-02', program_ad_deadline='2025-04-25', status='closed', is_synthetic=True),
    dict(id='ev-2026', year=2026, name='AAFE 52nd Annual Gala', event_date='2026-05-21', doors_time='6:00 PM', program_time='7:15 PM', venue_name='Synthetic venue', venue_address='New York, NY', dress_code='Cocktail', guest_list_deadline='2026-05-01', program_ad_deadline='2026-04-24', status='closed', is_synthetic=True),
    dict(id='ev-2027', year=2027, name='AAFE 53rd Annual Gala (demo)', event_date='2027-05-20', doors_time='6:00 PM', program_time='7:15 PM', venue_name='Demo Rooftop, Lower Manhattan', venue_address='100 Demo Street, New York, NY 10004 (synthetic)', dress_code='Cocktail attire', guest_list_deadline='2027-04-23', program_ad_deadline='2027-04-16', status='planning', is_synthetic=True),
]
CUR = 'ev-2027'

staff = [
    dict(id='st-mei', name='Mei Lin Ortiz', email='mei.ortiz@aafe-demo.example.org', role='gala_admin'),
    dict(id='st-daniel', name='Daniel Seo', email='daniel.seo@aafe-demo.example.org', role='relationship_manager'),
    dict(id='st-priya', name='Priya Raman', email='priya.raman@aafe-demo.example.org', role='relationship_manager'),
    dict(id='st-grace', name='Grace Huang', email='grace.huang@aafe-demo.example.org', role='relationship_manager'),
    dict(id='st-kenji', name='Kenji Abe (volunteer)', email='kenji.volunteer@aafe-demo.example.org', role='check_in_volunteer'),
]

tiers = [
    dict(id='platinum', name='Platinum — Lead Sponsor', contribution_amount=50000, included_seat_count=20, tier_category='sponsorship', required_materials=['logo', 'full_page_ad']),
    dict(id='gold', name='Gold — Documentary Screening Sponsor', contribution_amount=25000, included_seat_count=10, tier_category='sponsorship', required_materials=['logo', 'full_page_ad']),
    dict(id='silver', name='Silver — Signature Cocktail Sponsor', contribution_amount=15000, included_seat_count=8, tier_category='sponsorship', required_materials=['logo', 'half_page_ad']),
    dict(id='bronze', name='Bronze — Performance Sponsor', contribution_amount=10000, included_seat_count=6, tier_category='sponsorship', required_materials=['logo', 'half_page_ad']),
    dict(id='champion', name='Champion — Party Favor Sponsor', contribution_amount=7000, included_seat_count=2, tier_category='sponsorship', required_materials=['logo']),
    dict(id='friend', name='Friend Sponsor', contribution_amount=2500, included_seat_count=1, tier_category='sponsorship', required_materials=['logo']),
    dict(id='supporter', name='Supporter Sponsor', contribution_amount=1000, included_seat_count=1, tier_category='sponsorship', required_materials=['logo']),
    dict(id='corporate_ticket', name='Corporate Ticket', contribution_amount=500, included_seat_count=1, tier_category='ticket', required_materials=[]),
    dict(id='community_ticket', name='Community Ticket', contribution_amount=250, included_seat_count=1, tier_category='ticket', required_materials=[]),
    dict(id='full_page_ad', name='Full-Page Digital Advertising', contribution_amount=1000, included_seat_count=0, tier_category='advertising_only', required_materials=['full_page_ad']),
    dict(id='half_page_ad', name='Half-Page Digital Advertising', contribution_amount=500, included_seat_count=0, tier_category='advertising_only', required_materials=['half_page_ad']),
    dict(id='comp_relationship', name='Complimentary — Relationship Guests', contribution_amount=0, included_seat_count=0, tier_category='complimentary', required_materials=[]),
]
TIER = {t['id']: t for t in tiers}

# ---------------- sponsors ----------------
PHONES = iter(range(100, 200))
QR = random.Random(2027)  # separate source, so QR codes don't shift the main random sequence
def qr_token():
    # 128 random bits like backend.sql's new_qr_token(); sequential codes would let one guest guess another's (hard rule 6)
    return 'AAFE-' + f'{QR.getrandbits(128):032X}'
def phone():
    random.randint(1000, 9999)  # still drawn, so every other generated value stays the same
    return f'(212) 555-{next(PHONES):04d}'  # fictional range 555-0100 to 555-0199
S = lambda i, org, contact, email, owner, sf=None: dict(id=i, organization_name=org, primary_contact_name=contact, primary_contact_email=email, phone=phone(), relationship_owner_id=owner, salesforce_account_id=sf, created_at='2024-01-15T15:00:00Z')
sponsors = [
    S('sp-harborline', 'Harborline Community Bank', 'Evelyn Park', 'evelyn.park@harborline.example.org', 'st-mei', '001DEMO0000HARB'),
    S('sp-meridian', 'Meridian Family Foundation', 'Arthur Wong', 'awong@meridianfdn.example.org', 'st-daniel', '001DEMO0000MERI'),
    S('sp-acme', 'Acme Community Partners', 'Jordan Lee', 'jordan.lee@acmepartners.example.org', 'st-priya', '001DEMO0000ACME'),
    S('sp-northgate', 'Northgate Health Collective', 'Ingrid Larsen', 'ilarsen@northgate.example.org', 'st-daniel'),
    S('sp-lotus', 'Lotus Lane Design Studio', 'Vivian Tran', 'vivian@lotuslane.example.org', 'st-grace', '001DEMO0000LOTU'),
    S('sp-pacific', 'Pacific Rim Builders', 'Marco Delgado', 'mdelgado@pacificrim.example.org', 'st-grace'),
    S('sp-bowery', 'Brindlemoor Dental Group', 'Dr. Sun Hee Cho', 'scho@brindlemoordental.example.org', 'st-priya'),
    S('sp-queens', 'Quarrystone Tech Collective', 'Ravi Patel', 'ravi@quarrystonetech.example.org', 'st-daniel'),
    S('sp-dumpling', 'Golden Dumpling Co.', 'Henry Lau', 'henry@goldendumpling.example.org', 'st-priya'),
    S('sp-okafor', 'Chidi Okafor', 'Chidi Okafor', 'c.okafor@riversidelegal.example.org', 'st-grace'),
    S('sp-alvarez', 'Maria Alvarez', 'Maria Alvarez', 'maria.alvarez@mail.example.org', 'st-grace'),
    S('sp-kimfam', 'Kim Family Fund', 'Joyce Kim', 'joyce.kim@kimfamily.example.org', 'st-mei'),
    S('sp-tanaka', 'Ken Tanaka', 'Ken Tanaka', 'ken.tanaka@mail.example.org', 'st-daniel'),
    S('sp-brooks', 'Alisha Brooks', 'Alisha Brooks', 'alisha.brooks@mail.example.org', 'st-priya'),
    S('sp-aafe-rel', "AAFE Executive Director's Office", 'AAFE Gala Team', 'gala-team@aafe-demo.example.org', 'st-mei'),
]

# ---------------- current-year orders ----------------
# (order_id, sponsor, tier, source, status, token, logo, ad, notes, created)
O = []
def order(oid, sp, tier, source, status, token, logo='not_required', ad='not_required', notes='', created='2026-09-10T14:00:00Z', commit=None, link_sent=None):
    t = TIER[tier]
    O.append(dict(id=oid, event_id=CUR, sponsor_id=sp, tier_id=tier, source=source,
                  commitment_amount=t['contribution_amount'] if commit is None else commit, status=status,
                  portal_token=token, portal_token_expires_at='2027-05-21T04:00:00Z' if token else None,
                  portal_link_sent_at=link_sent, guest_list_deadline='2027-04-23',
                  logo_status=logo, program_ad_status=ad, givelively_order_ref=None,
                  salesforce_opportunity_id=None, internal_notes=notes, created_at=created, updated_at=created))

order('ord-harborline', 'sp-harborline', 'platinum', 'ach_direct', 'paid', 'hb-7f3k9q2m', 'approved', 'pending', 'Lead sponsor. CEO may bring board members; confirm two weeks out.', '2026-08-01T14:00:00Z', link_sent='2026-08-14T16:05:00Z')
order('ord-meridian', 'sp-meridian', 'gold', 'wire', 'partially_paid', 'mf-2p8x4r1d', 'received', 'received', 'Pledge by email; second installment expected Q1 2027.', '2026-08-20T14:00:00Z', link_sent='2026-09-02T15:10:00Z')
order('ord-acme', 'sp-acme', 'silver', 'check', 'pledged', 'ac-6w9k3p5d', 'pending', 'received', 'Check expected after their October board meeting. Jordan prefers email.', '2026-09-05T14:00:00Z', link_sent='2026-09-05T14:20:00Z')
order('ord-northgate', 'sp-northgate', 'bronze', 'givelively', 'paid', 'ng-5t1w8e3z', 'pending', 'pending', 'Bought on Give Lively; only purchaser name came through.', '2026-09-18T19:42:00Z', link_sent='2026-09-18T20:30:00Z')
order('ord-lotus', 'sp-lotus', 'champion', 'givelively', 'paid', 'll-9c2v6b4n', 'approved', 'not_required', 'Complete. Designing party-favor packaging in-kind.', '2026-07-30T13:15:00Z', link_sent='2026-07-30T13:30:00Z')
order('ord-pacific', 'sp-pacific', 'silver', 'givelively', 'paid', 'pr-3m7h1k5j', 'received', 'pending', 'Paid by bank transfer on Give Lively (0.8% fee, capped at $5).', '2026-09-22T17:00:00Z', link_sent='2026-09-22T17:30:00Z')
order('ord-bowery', 'sp-bowery', 'friend', 'givelively', 'paid', 'bd-8q4s2x7c', 'pending', 'not_required', '', '2026-09-24T12:00:00Z', link_sent='2026-09-24T12:30:00Z')
order('ord-queens', 'sp-queens', 'supporter', 'givelively', 'paid', 'qt-1z6y3u9i', 'received', 'not_required', '', '2026-09-25T12:00:00Z', link_sent='2026-09-25T12:30:00Z')
order('ord-dumpling', 'sp-dumpling', 'full_page_ad', 'staff_entry', 'invoice_sent', None, 'not_required', 'pending', 'Advertising only — no seats.', '2026-09-12T12:00:00Z')
order('ord-okafor', 'sp-okafor', 'corporate_ticket', 'givelively', 'paid', 'co-4r8t2y6u', created='2026-09-25T21:00:00Z', link_sent='2026-09-25T21:30:00Z')
order('ord-alvarez', 'sp-alvarez', 'community_ticket', 'givelively', 'paid', 'ma-7u3i9o1p', created='2026-09-26T21:00:00Z', link_sent='2026-09-26T21:30:00Z')
order('ord-kimfam', 'sp-kimfam', 'corporate_ticket', 'check', 'paid', 'kf-6y2t8r4e', created='2026-09-20T15:00:00Z', commit=1000, link_sent='2026-09-21T15:00:00Z')
order('ord-tanaka', 'sp-tanaka', 'community_ticket', 'givelively', 'paid', 'kt-2w5e8r1t', created='2026-09-27T23:00:00Z', link_sent='2026-09-27T23:30:00Z')
order('ord-brooks', 'sp-brooks', 'community_ticket', 'givelively', 'paid', 'ab-9o4i7u2y', created='2026-09-28T01:00:00Z', link_sent='2026-09-28T01:30:00Z')
order('ord-rel', 'sp-aafe-rel', 'comp_relationship', 'comp', 'comp', None, notes='Complimentary relationship guests. QR invitations emailed by staff.', created='2026-09-01T12:00:00Z')

SEATS_FOR = {o['id']: TIER[o['tier_id']]['included_seat_count'] for o in O}
SEATS_FOR['ord-kimfam'] = 2  # bought two corporate tickets
SEATS_FOR['ord-rel'] = 8

payments = []
P = lambda *a, **k: payments.append(make_payment(*a, **k))
P('pay-harb-1', 'ord-harborline', 'ach_direct', 50000, '2026-08-14T15:00:00Z', recorded_by='st-mei', sf='006DEMO00HARB27')
P('pay-meri-1', 'ord-meridian', 'wire', 12500, '2026-09-02T14:30:00Z', recorded_by='st-daniel', sf='006DEMO00MERI27')
P('pay-north-1', 'ord-northgate', 'card', 10000, '2026-09-18T19:42:00Z', covered=True)
P('pay-lotus-1', 'ord-lotus', 'amex', 7000, '2026-07-30T13:15:00Z', sf='006DEMO00LOTU27')
P('pay-pac-1', 'ord-pacific', 'givelively_ach', 15000, '2026-09-22T17:00:00Z', covered=True)
P('pay-bow-1', 'ord-bowery', 'card', 2500, '2026-09-24T12:00:00Z')
P('pay-que-1', 'ord-queens', 'card', 1000, '2026-09-25T12:00:00Z', covered=True)
P('pay-oka-1', 'ord-okafor', 'card', 500, '2026-09-25T21:00:00Z', covered=True)
P('pay-alv-1', 'ord-alvarez', 'card', 250, '2026-09-26T21:00:00Z')
P('pay-kim-1', 'ord-kimfam', 'check', 1000, '2026-09-20T15:00:00Z', recorded_by='st-mei', check_no='4417', recon='needs_review')
P('pay-tan-1', 'ord-tanaka', 'card', 250, '2026-09-27T23:00:00Z', covered=True)
P('pay-bro-1', 'ord-brooks', 'amex', 250, '2026-09-28T01:00:00Z')
for o in O:
    gl = [p for p in payments if p['order_id'] == o['id'] and p['givelively_transaction_id']]
    if gl: o['givelively_order_ref'] = gl[0]['givelively_transaction_id']

# ---------------- history (past galas) ----------------
history_orders = []
def past(oid, ev, sp, tier, method, when, covered=False):
    t = TIER[tier]
    src = {'card': 'givelively', 'amex': 'givelively', 'givelively_ach': 'givelively', 'check': 'check', 'ach_direct': 'ach_direct', 'wire': 'wire'}[method]
    history_orders.append(dict(id=oid, event_id=ev, sponsor_id=sp, tier_id=tier, source=src, commitment_amount=t['contribution_amount'], status='paid',
        portal_token=None, portal_token_expires_at=None, portal_link_sent_at=None, guest_list_deadline=None, logo_status='approved' if 'logo' in t['required_materials'] else 'not_required',
        program_ad_status='approved' if any('ad' in m for m in t['required_materials']) else 'not_required', givelively_order_ref=None,
        salesforce_opportunity_id=f'006DEMO{oid[-6:].upper()}', internal_notes='Historical (synthetic).', created_at=when, updated_at=when))
    P(f'pay-{oid}', oid, method, t['contribution_amount'], when, covered=covered, recorded_by='st-mei' if src != 'givelively' else 'givelively_sync', sf=f'006DEMO{oid[-6:].upper()}')
past('ord-24-harb', 'ev-2024', 'sp-harborline', 'gold', 'check', '2024-04-02T15:00:00Z')
past('ord-25-harb', 'ev-2025', 'sp-harborline', 'gold', 'ach_direct', '2025-03-28T15:00:00Z')
past('ord-26-harb', 'ev-2026', 'sp-harborline', 'platinum', 'ach_direct', '2026-03-30T15:00:00Z')
past('ord-24-meri', 'ev-2024', 'sp-meridian', 'gold', 'wire', '2024-04-10T15:00:00Z')
past('ord-26-meri', 'ev-2026', 'sp-meridian', 'gold', 'wire', '2026-04-08T15:00:00Z')
past('ord-25-acme', 'ev-2025', 'sp-acme', 'bronze', 'check', '2025-04-14T15:00:00Z')
past('ord-26-acme', 'ev-2026', 'sp-acme', 'silver', 'check', '2026-04-20T15:00:00Z')
past('ord-25-lotus', 'ev-2025', 'sp-lotus', 'friend', 'card', '2025-04-01T15:00:00Z', covered=True)
past('ord-26-lotus', 'ev-2026', 'sp-lotus', 'champion', 'amex', '2026-04-03T15:00:00Z')
past('ord-26-north', 'ev-2026', 'sp-northgate', 'supporter', 'card', '2026-04-22T15:00:00Z')
past('ord-24-kim', 'ev-2024', 'sp-kimfam', 'champion', 'check', '2024-05-01T15:00:00Z')
past('ord-26-kim', 'ev-2026', 'sp-kimfam', 'friend', 'check', '2026-04-29T15:00:00Z')

# ---------------- tables ----------------
tables = []
pos = [(20, 30), (40, 30), (60, 30), (80, 30), (20, 55), (40, 55), (60, 55), (80, 55), (30, 80), (50, 80), (70, 80)]
labels = {1: 'Head table', 2: 'Harborline', 3: 'Harborline', 4: 'Meridian', 5: 'Acme', 6: 'Pacific Rim'}
for i, (x, y) in enumerate(pos, start=1):
    tables.append(dict(id=f'tb-{i}', event_id=CUR, number=i, label=labels.get(i), capacity=10, pos_x=x, pos_y=y))

# ---------------- guests + seats ----------------
FIRST = ['Evelyn', 'Marcus', 'Sofia', 'Hao', 'Amara', 'Liam', 'Rachel', 'Joseph', 'Nina', 'Tomás', 'Wen', 'Grace', 'Arthur', 'Helen', 'Kwame', 'Lucía', 'Jun', 'Patricia',
         'Jordan', 'Alicia', 'Samuel', 'Fatima', 'Brian', 'Ingrid', 'Omar', 'Vivian', 'Mateo', 'Marco', 'Aiko', 'Deepa', 'Luis', 'Hannah', 'Tae-yang', 'Bianca', 'Sun Hee', 'Ravi',
         'Chidi', 'Maria', 'Joyce', 'Daniel', 'Ken', 'Alisha', 'Leah', 'Councilmember', 'Rev. Peter', 'Dr. Annie', 'Victor', 'Yolanda', 'Eddie', 'Mabel', 'Thomas']
gid = 0
guests, seats = [], []
def add_guest(oid, slot, first, last, title, org, status, table=None, seat=None, gtype='sponsor_guest', dietary=None, access=None, by='staff', updated='2026-09-26T15:00:00Z', qr=None, rel_note=None):
    global gid
    gid += 1
    g = dict(id=f'g-{gid:03d}', order_id=oid, first_name=first, last_name=last, title=title, organization=org,
             email=f"{first}.{last}".lower().replace(' ', '').replace('.', '', first.count('.')).replace('é', 'e').replace('á', 'a').replace('í', 'i').replace('ó', 'o').replace("’", '') + '@guest.example.org',
             dietary_needs=dietary, accessibility_needs=access, guest_type=gtype, relationship_note=rel_note,
             table_id=f'tb-{table}' if table else None, seat_number=seat,
             badge_status='ready' if status in ('badge_ready', 'checked_in') else 'needs_review',
             attendance_status='checked_in' if status == 'checked_in' else 'expected', qr_token=qr,
             last_updated_by=by, created_at=updated, updated_at=updated)
    guests.append(g)
    seats.append(dict(id=f'seat-{oid}-{slot}', order_id=oid, slot_number=slot, guest_id=g['id'], status=status, updated_at=updated))
    return g

def unnamed(oid, slot):
    seats.append(dict(id=f'seat-{oid}-{slot}', order_id=oid, slot_number=slot, guest_id=None, status='unnamed', updated_at='2026-09-10T14:00:00Z'))

# Harborline 20: 12 named
hb = [('Evelyn', 'Park', 'Chief Executive Officer', 'badge_ready', 2, 1), ('Marcus', 'Bell', 'Chief Financial Officer', 'badge_ready', 2, 2), ('Sofia', 'Reyes', 'VP, Community Lending', 'badge_ready', 2, 3),
      ('Hao', 'Zhang', 'Branch Manager, Flushing', 'badge_ready', 2, 4), ('Amara', 'Okoye', 'Director of Philanthropy', 'reviewed', 2, 5), ('Liam', 'Nguyen', 'Board Member', 'reviewed', 2, 6),
      ('Rachel', 'Kim', 'SVP, Operations', 'reviewed', 3, 1), ('Joseph', 'Alvarez', 'Community Relations Lead', 'reviewed', 3, 2),
      ('Nina', 'Castillo', 'Small Business Banker', 'submitted', None, None), ('Tomás', 'Herrera', 'Analyst', 'submitted', None, None),
      ('Wen', 'Li', 'Compliance Officer', 'submitted', None, None), ('Grace', 'Odum', 'Marketing Manager', 'submitted', None, None)]
for i, (f, l, t, s, tb, st) in enumerate(hb, 1):
    add_guest('ord-harborline', i, f, l, t, 'Harborline Community Bank', s, tb, st, by='guest_portal' if s == 'submitted' else 'staff', updated='2026-09-26T18:42:00Z' if s == 'submitted' else '2026-09-15T15:00:00Z')
for i in range(13, 21): unnamed('ord-harborline', i)

mf = [('Arthur', 'Wong', 'Executive Director', 'badge_ready', 4, 1), ('Helen', 'Matsuda', 'Program Officer', 'badge_ready', 4, 2), ('Kwame', 'Asante', 'Trustee', 'reviewed', 4, 3),
      ('Lucía', 'Fernández', 'Trustee', 'reviewed', None, None), ('Jun', 'Ito', 'Grants Associate', 'submitted', None, None), ('Patricia', 'Lowe', 'Communications Director', 'submitted', None, None)]
for i, (f, l, t, s, tb, st) in enumerate(mf, 1):
    add_guest('ord-meridian', i, f, l, t, 'Meridian Family Foundation', s, tb, st, by='guest_portal' if s == 'submitted' else 'staff')
for i in range(7, 11): unnamed('ord-meridian', i)

add_guest('ord-acme', 1, 'Jordan', 'Lee', 'Managing Director', 'Acme Community Partners', 'badge_ready', 5, 1, updated='2026-09-12T15:00:00Z')
add_guest('ord-acme', 2, 'Alicia', 'Moreno', 'Partner', 'Acme Community Partners', 'badge_ready', 5, 2, updated='2026-09-12T15:00:00Z')
add_guest('ord-acme', 3, 'Samuel', 'Chen', 'Director of Community Programs', 'Acme Community Partners', 'submitted', dietary='Vegetarian', by='guest_portal', updated='2026-09-28T14:10:00Z')
add_guest('ord-acme', 4, 'Fatima', 'Haddad', 'Senior Associate', 'Acme Community Partners', 'submitted', dietary='Halal', by='guest_portal', updated='2026-09-28T14:11:00Z')
add_guest('ord-acme', 5, 'Brian', 'O’Connell', 'Associate', 'Acme Community Partners', 'submitted', access='Step-free seating', by='guest_portal', updated='2026-09-28T14:12:00Z')
for i in range(6, 9): unnamed('ord-acme', i)

add_guest('ord-northgate', 1, 'Ingrid', 'Larsen', 'Medical Director', 'Northgate Health Collective', 'reviewed', 7, 1)
add_guest('ord-northgate', 2, 'Omar', 'Siddiqui', 'Practice Manager', 'Northgate Health Collective', 'submitted', by='guest_portal', updated='2026-09-22T16:20:00Z')
for i in range(3, 7): unnamed('ord-northgate', i)

add_guest('ord-lotus', 1, 'Vivian', 'Tran', 'Founder & Creative Director', 'Lotus Lane Design Studio', 'badge_ready', 7, 3, dietary='No shellfish')
add_guest('ord-lotus', 2, 'Mateo', 'Ruiz', 'Senior Designer', 'Lotus Lane Design Studio', 'badge_ready', 7, 4)

pr = [('Marco', 'Delgado', 'President'), ('Aiko', 'Saito', 'VP, Development'), ('Deepa', 'Nair', 'Project Executive'), ('Luis', 'Ortega', 'Site Superintendent'), ('Hannah', 'Goldfarb', 'General Counsel'), ('Tae-yang', 'Park', 'Estimator')]
for i, (f, l, t) in enumerate(pr, 1):
    add_guest('ord-pacific', i, f, l, t, 'Pacific Rim Builders', 'reviewed' if i <= 4 else 'submitted', 6 if i <= 4 else None, i if i <= 4 else None, by='guest_portal', updated='2026-09-29T13:00:00Z')
for i in range(7, 9): unnamed('ord-pacific', i)

add_guest('ord-bowery', 1, 'Sun Hee', 'Cho', 'Owner & Dentist', 'Brindlemoor Dental Group', 'submitted', by='guest_portal', updated='2026-09-24T13:00:00Z')
add_guest('ord-queens', 1, 'Ravi', 'Patel', 'Founder', 'Quarrystone Tech Collective', 'badge_ready', 8, 1)
add_guest('ord-okafor', 1, 'Chidi', 'Okafor', 'Staff Attorney', 'Riverside Legal Aid', 'badge_ready', 8, 2, gtype='ticket_holder')
add_guest('ord-alvarez', 1, 'Maria', 'Alvarez', 'Community Organizer', 'Lowmere Tenants Union', 'reviewed', 8, 3, gtype='ticket_holder', dietary='Vegan')
add_guest('ord-kimfam', 1, 'Joyce', 'Kim', 'Trustee', 'Kim Family Fund', 'badge_ready', 8, 4, gtype='ticket_holder')
add_guest('ord-kimfam', 2, 'Daniel', 'Kim', 'Trustee', 'Kim Family Fund', 'badge_ready', 8, 5, gtype='ticket_holder')
add_guest('ord-tanaka', 1, 'Ken', 'Tanaka', 'Architect', 'Tanaka Studio', 'submitted', gtype='ticket_holder', by='guest_portal', updated='2026-09-28T00:10:00Z')
unnamed('ord-brooks', 1)

rel = [('Leah', 'Goldberg', 'Chief of Staff', 'District 1 Council Office (synthetic)', 'Elected-official staff', 1, 1),
       ('Rev. Peter', 'Wu', 'Pastor', 'Chinatown Community Church (synthetic)', 'Longtime community partner', 1, 2),
       ('Dr. Annie', 'Lam', 'Honoree', 'Community Health Leader (synthetic)', '2027 honoree', 1, 3),
       ('Victor', 'Huang', 'Board Chair', 'AAFE Board (synthetic)', 'Board', 1, 4),
       ('Yolanda', 'Rivera', 'Executive Director', 'Flushing Small Business Alliance (synthetic)', 'Partner organization', 1, 5),
       ('Eddie', 'Chan', 'Owner', 'Chan’s Bakery (synthetic)', 'Small-business program alumnus', None, None),
       ('Mabel', 'Fong', 'Retired Teacher', 'Senior Center Volunteer (synthetic)', 'Older-adult program volunteer', None, None),
       ('Thomas', 'Reid', 'Program Director', 'Partner Foundation (synthetic)', 'Funder relationship', 1, 6)]
for i, (f, l, t, org, note, tb, st) in enumerate(rel, 1):
    add_guest('ord-rel', i, f, l, t, org, 'badge_ready' if tb else 'reviewed', tb, st, gtype='comp_relationship', qr=qr_token(), rel_note=note, updated='2026-09-01T12:00:00Z')

# Event-day demo check-ins (as if a rehearsal)
check_ins = [
    dict(id='ci-001', event_id=CUR, guest_id='g-' + next(g['id'][2:] for g in guests if g['first_name'] == 'Vivian'), order_id='ord-lotus', arrival_name=None, method='search', type='standard', checked_in_by='Kenji Abe (volunteer)', note='', checked_in_at='2026-09-30T23:05:00Z'),
    dict(id='ci-002', event_id=CUR, guest_id=None, order_id='ord-harborline', arrival_name='Daniel Fogel (guest of Harborline)', method='exception', type='Sponsor seat was not previously named', checked_in_by='Mei Lin Ortiz', note='Filling open Harborline seat 13; approved by relationship owner.', checked_in_at='2026-09-30T23:12:00Z'),
]
for g in guests:
    if g['id'] == check_ins[0]['guest_id']:
        g['attendance_status'] = 'checked_in'
for s in seats:
    if s['guest_id'] == check_ins[0]['guest_id']:
        s['status'] = 'checked_in'

# ---------------- emails ----------------
emails = []
eid = 0
def email(template, to, name, oid=None, gid_=None, trigger='staff_manual', status='sent', at=None):
    global eid
    eid += 1
    emails.append(dict(id=f'em-{eid:03d}', template=template, to_email=to, to_name=name, order_id=oid, guest_id=gid_, trigger=trigger, status=status, sent_at=at))
SP = {s['id']: s for s in sponsors}
for o in O:
    if o['portal_token']:
        trig = 'givelively_sync' if o['source'] == 'givelively' else 'payment_recorded'
        email('portal_link', SP[o['sponsor_id']]['primary_contact_email'], SP[o['sponsor_id']]['primary_contact_name'], o['id'], trigger=trig, status='opened', at=o['portal_link_sent_at'])
for g in guests:
    if g['qr_token']:
        email('qr_invitation', g['email'], f"{g['first_name']} {g['last_name']}", 'ord-rel', g['id'], trigger='staff_manual', status='sent' if g['last_name'] not in ('Fong',) else 'queued', at='2026-09-03T14:00:00Z' if g['last_name'] != 'Fong' else None)
email('guest_list_reminder', SP['sp-acme']['primary_contact_email'], 'Jordan Lee', 'ord-acme', trigger='scheduled', status='queued')

# ---------------- audit log ----------------
audit = []
def log(at, actor_type, actor, entity, entity_id, oid, action, summary, frm=None, to=None, visible=False):
    audit.append(dict(at=at, actor_type=actor_type, actor=actor, entity=entity, entity_id=entity_id, order_id=oid, action=action, from_state=frm, to_state=to, guest_visible=visible, summary=summary))
for o in O:
    sp = SP[o['sponsor_id']]
    log(o['created_at'], 'system' if o['source'] == 'givelively' else 'staff', 'Give Lively sync' if o['source'] == 'givelively' else 'Mei Lin Ortiz', 'order', o['id'], o['id'], 'order.created',
        f"{TIER[o['tier_id']]['name']} recorded for {sp['organization_name']} ({o['source']}).", None, o['status'], visible=o['tier_id'] != 'comp_relationship')
for p in payments:
    if p['order_id'].startswith('ord-') and any(o['id'] == p['order_id'] for o in O):
        log(p['received_at'], 'system' if p['recorded_by'] == 'givelively_sync' else 'staff', 'Give Lively sync' if p['recorded_by'] == 'givelively_sync' else 'Staff', 'payment', p['id'], p['order_id'], 'payment.recorded',
            f"Payment received: ${p['gross_amount']:,.2f}.", visible=True)
for o in O:
    if o['portal_link_sent_at']:
        log(o['portal_link_sent_at'], 'system', 'Email service', 'email', o['id'], o['id'], 'portal_link.sent', 'Private guest-list link emailed.', visible=True)
for g in guests:
    seat = next(s for s in seats if s['guest_id'] == g['id'])
    log(g['created_at'], 'guest_portal' if g['last_updated_by'] == 'guest_portal' else 'staff', 'Guest portal' if g['last_updated_by'] == 'guest_portal' else 'Staff',
        'guest', g['id'], g['order_id'], 'guest.submitted', f"{g['first_name']} {g['last_name']} added to seat {seat['slot_number']}.", 'unnamed', 'submitted', visible=True)
    if seat['status'] in ('reviewed', 'badge_ready', 'checked_in'):
        log(g['created_at'][:11] + '20:00:00Z', 'staff', 'Priya Raman', 'seat', seat['id'], g['order_id'], 'seat.reviewed', f"{g['first_name']} {g['last_name']} confirmed by AAFE.", 'submitted', 'reviewed', visible=True)
audit.sort(key=lambda a: a['at'])
for i, a in enumerate(audit, 1): a['id'] = i

# ---------------- salesforce map ----------------
sf = []
for s in sponsors:
    sf.append(dict(entity='sponsor', entity_id=s['id'], sf_object='Account', sf_id=s['salesforce_account_id'], status='synced' if s['salesforce_account_id'] else 'pending', last_synced_at='2026-09-30T13:30:00Z' if s['salesforce_account_id'] else None, error_message=None))
for p in payments:
    sf.append(dict(entity='payment', entity_id=p['id'], sf_object='Opportunity', sf_id=p['salesforce_opportunity_id'], status='synced' if p['salesforce_opportunity_id'] else 'pending', last_synced_at='2026-09-30T13:30:00Z' if p['salesforce_opportunity_id'] else None, error_message=None))

data = dict(meta=dict(generated_for='AAFE Gala Guest Operations capstone (ERIMX BOKHUS)', synthetic=True, current_event_id=CUR,
                      fee_rates=dict(card='2.2% + $0.30', amex='3.5%', givelively_ach='0.8% capped at $5', offline='$0 processor fee'),
                      fee_source='https://www.givelively.org/fees-and-disbursement'),
            gala_events=events, staff_users=staff, sponsorship_tiers=tiers, sponsors=sponsors, orders=O + history_orders,
            payments=payments, event_tables=tables, guests=guests, seats=seats, check_ins=check_ins, email_log=emails,
            audit_log=audit, salesforce_sync=sf, seat_counts=SEATS_FOR)

os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
json.dump(data, open(OUT_JSON, 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)   # LF on every OS, so CI's drift check matches

# ---------------- SQL ----------------
def lit(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "'{" + ','.join(v) + "}'"
    return "'" + str(v).replace("'", "''") + "'"
order_tables = ['gala_events', 'staff_users', 'sponsorship_tiers', 'sponsors', 'orders', 'payments', 'event_tables', 'guests', 'seats', 'check_ins', 'email_log', 'audit_log', 'salesforce_sync']
with open(OUT_SQL, 'w', encoding='utf-8', newline='\n') as f:
    f.write('-- SYNTHETIC SEED DATA for AAFE Gala Guest Operations (generated by generate_seed.py)\n-- All people, organizations, emails and payments are fictional.\nbegin;\n')
    for t in order_tables:
        rows = data[t]
        if not rows: continue
        cols = list(rows[0].keys())
        f.write(f'\n-- {t} ({len(rows)} rows)\n')
        for r in rows:
            f.write(f"insert into {t} ({', '.join(cols)}) values ({', '.join(lit(r.get(c)) for c in cols)});\n")
    f.write('\ncommit;\n')

tot = [p for p in payments if any(o['id'] == p['order_id'] for o in O)]
print('orders', len(O), 'history', len(history_orders), 'guests', len(guests), 'seats', len(seats), 'payments', len(payments), 'audit', len(audit))
print('2027 gross', sum(p['gross_amount'] for p in tot), 'fees', round(sum(p['transaction_fee_amount'] for p in tot), 2), 'net', round(sum(p['net_amount'] for p in tot), 2))
