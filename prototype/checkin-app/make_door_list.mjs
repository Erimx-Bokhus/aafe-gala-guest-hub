// CAUTION: running this REPLACES src/doorlist.json. The committed list holds the 553-guest demo gala; main's
// shared/src/seed.json currently has the 48-guest demo, so don't run it until the team decides which demo data to use.
// Builds checkin-app/src/doorlist.json from shared/src/seed.json with ONLY the fields a door volunteer may see.
// No emails, payments, amounts, relationship owners, internal notes, dietary or accessibility data ever reach the iPad bundle.
// Runs automatically before `npm run build -w checkin-app` / `npm run dev -w checkin-app`.
// PRODUCTION: replace with a Supabase view/RPC (`v_door_list`) restricted to the check_in_volunteer role.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const db = JSON.parse(fs.readFileSync(path.join(root, 'shared/src/seed.json'), 'utf8'))
const orderById = Object.fromEntries(db.orders.map((o) => [o.id, o]))
const sponsorById = Object.fromEntries(db.sponsors.map((s) => [s.id, s]))
const tierById = Object.fromEntries(db.sponsorship_tiers.map((t) => [t.id, t]))
const tableById = Object.fromEntries(db.event_tables.map((t) => [t.id, t]))
const CATEGORY = { sponsor_guest: 'Sponsor guest', ticket_holder: 'Ticket holder', comp_relationship: 'Comped', aafe_staff: 'AAFE staff', event_volunteer: 'Event volunteer', event_staff: 'Event staff', government_vip: 'Government or VIP' }
// What kind of seat the guest holds, shown on the door list.
const seatLabel = (g, o) => g.guest_type === 'sponsor_guest' ? `Sponsor seat · ${sponsorById[o.sponsor_id]?.organization_name ?? ''}`
  : g.guest_type === 'ticket_holder' ? `Ticket · ${tierById[o.tier_id]?.name ?? 'Ticket'}`
  : g.guest_type === 'comp_relationship' ? 'Complimentary guest of AAFE'
  : g.guest_type === 'government_vip' ? 'Government / VIP invitation'
  : g.guest_type === 'aafe_staff' ? 'AAFE staff' : g.guest_type === 'event_volunteer' ? 'Event volunteer' : 'Event staff'

const out = {
  synthetic: true,
  generated_from: 'shared/src/seed.json',
  current_event_id: db.meta.current_event_id,
  // Only the current gala is checked in on the iPad; past galas have already happened.
  events: db.gala_events.filter((e) => e.id === db.meta.current_event_id).map(({ id, year, name, event_date, doors_time, venue_name, status }) => ({ id, year, name, event_date, doors_time, venue_name, status })),
  volunteers: db.staff_users.map(({ id, name, role }) => ({ id, name, role })),
  sponsors: db.orders.filter((o) => o.status !== 'cancelled' && o.event_id === db.meta.current_event_id && o.tier_id !== 'comp_relationship').map((o) => ({ order_id: o.id, event_id: o.event_id, name: sponsorById[o.sponsor_id]?.organization_name ?? '' })),
  guests: db.guests.filter((g) => orderById[g.order_id]?.event_id === db.meta.current_event_id).map((g) => {
    const o = orderById[g.order_id]
    const t = tableById[g.table_id]
    return {
      id: g.id, event_id: o.event_id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization,
      sponsor: g.guest_type === 'sponsor_guest' || g.guest_type === 'ticket_holder' ? sponsorById[o.sponsor_id]?.organization_name ?? '' : '',
      package: !['sponsor_guest', 'ticket_holder'].includes(g.guest_type) ? '' : (tierById[o.tier_id]?.name.split(' — ')[0] ?? ''),
      category: CATEGORY[g.guest_type] ?? g.guest_type, category_key: g.guest_type, seat_label: seatLabel(g, o), table: t ? t.number : null, seat: g.seat_number, qr_token: g.qr_token,
    }
  }),
  // Seed check-ins without notes (notes are internal); the live list comes from the sync server.
  check_ins: db.check_ins.map((c) => ({ ...c, note: '' })),
}
const dest = path.join(root, 'checkin-app/src/doorlist.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 1))
const banned = ['email', 'amount', 'dietary', 'accessibility', 'internal_notes', 'relationship_owner', 'relationship_note', 'payment']
const text = JSON.stringify(out)
for (const b of banned) if (text.includes(`"${b}`)) throw new Error(`door list leaked field: ${b}`)
console.log(`door list: ${out.guests.length} guests, ${out.events.length} galas -> checkin-app/src/doorlist.json`)
