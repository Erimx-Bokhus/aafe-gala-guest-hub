// What the door screen needs, whichever way the app runs:
//   live (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set): staff sign in, the list comes from
//     staff_checkin_snapshot(), check-ins sync through staff_sync_check_ins() (liveDoor.ts);
//   demo (no keys, e.g. OPEN-CheckIn-App.html): the bundled invented door list and the demo sync server (demoDoor.ts).
// The screen (App.tsx) only talks to a Door, so both look and behave the same at the door.
import type { Notice } from '@shared/offlineCheckin'

/** True when this build has Supabase settings. Fixed at build time, so a live build leaves the demo door list out. */
export const LIVE = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

/** A guest as the door shows them: name, title, organization, category, seat and table. Never payments, emails or notes. */
export interface DoorGuest {
  id: string
  order_id: string
  first_name: string
  last_name: string
  title: string | null
  organization: string | null
  sponsor: string
  category: string
  seat_label: string
  table: number | null
  /** The guest has accessibility needs; the details stay in the staff app. */
  access: boolean
}
export interface Gala { id: string; name: string; event_date: string; doors_time: string | null; venue_name: string | null }
/** `handle` names the check-in for Undo. */
export interface Arrival { handle: string; at: string; by: string; queued: boolean }
export interface ExceptionRow { handle: string; name: string; type: string; at: string; by: string; queued: boolean }
export interface DoorStatus { online: boolean | null; pending: number }

export interface Door {
  gala: Gala
  guests: DoorGuest[]
  sponsors: { order_id: string; name: string }[]
  status: DoorStatus
  arrivals(): Map<string, Arrival>
  exceptions(): ExceptionRow[]
  /** Check-ins the server didn't count (someone else was first, or refused), until dismissed. */
  notices(): Notice[]
  dismiss(clientId: string): void
  /** Returns the handles of the check-ins made (already checked-in guests are skipped). */
  checkIn(guestIds: string[], method: 'search' | 'qr'): string[]
  /** A scanned or typed code: null when the guest was checked in, otherwise what to tell the volunteer. */
  scan(code: string): Promise<string | null>
  addException(p: { name: string; type: string; orderId: string; note: string }): string
  /** Null when undone, otherwise why not ("Only Kenji Abe or a gala admin can undo this check-in"). */
  undo(handles: string[]): Promise<string | null>
  subscribe(fn: () => void): () => void
  start(): void
  stop(): void
}

// AAFE's seven guest categories, as the door list names them.
export const CATEGORY: Record<string, string> = {
  sponsor_guest: 'Sponsor guest', ticket_holder: 'Ticket holder', comp_relationship: 'Comped', aafe_staff: 'AAFE staff',
  event_volunteer: 'Event volunteer', event_staff: 'Event staff', government_vip: 'Government or VIP',
}
/** What kind of seat the guest holds (the same wording as make_door_list.mjs). */
export function seatLabel(guestType: string, sponsor: string, pkg: string | null | undefined): string {
  switch (guestType) {
    case 'sponsor_guest': return `Sponsor seat · ${sponsor}`
    case 'ticket_holder': return `Ticket · ${pkg || 'Ticket'}`
    case 'comp_relationship': return 'Complimentary guest of AAFE'
    case 'government_vip': return 'Government / VIP invitation'
    default: return CATEGORY[guestType] ?? guestType
  }
}
