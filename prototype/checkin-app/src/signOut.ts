// Signing out of the iPad (team audit, bug 1). Sign-out clears the saved list and the queue from the iPad, so
// check-ins still waiting would be lost. Waiting check-ins are sent first; if any can't be sent (no internet),
// sign-out stops and says how many. Only a gala admin can sign out anyway, after confirming.
import type { CheckInDesk, QueuedCheckIn, SyncResult } from '@shared/offlineCheckin'

export type SignOutCheck = { ok: true } | { ok: false; waiting: number; canForce: boolean; refused: boolean }

export async function checkSignOut(
  desk: Pick<CheckInDesk, 'pending' | 'sync'>,
  send: (items: QueuedCheckIn[]) => Promise<SyncResult[]>,
  role: string,
): Promise<SignOutCheck> {
  const r = desk.pending().length ? await desk.sync(send) : null
  const waiting = desk.pending().length
  return waiting ? { ok: false, waiting, canForce: role === 'gala_admin', refused: r?.refused ?? false } : { ok: true }
}

/** What the volunteer reads when sign-out is stopped: no internet, or AAFE refused this iPad's check-ins. */
export function waitingMessage(waiting: number, canForce: boolean, refused = false): string {
  const what = waiting === 1 ? '1 check-in hasn’t' : `${waiting} check-ins haven’t`
  const lose = `Signing out now would delete ${waiting === 1 ? 'it' : 'them'} from this iPad. `
  if (refused) return `${what} reached AAFE yet: this iPad’s sign-in needs attention. ${lose}Ask a gala admin before signing out` +
    (canForce ? ', or sign out anyway.' : '.')
  return `${what} reached AAFE yet. ${lose}Connect to the internet and try again` + (canForce ? ', or sign out anyway.' : ', or ask a gala admin.')
}
