// Signing out of the iPad (team audit, bug 1). Sign-out clears the saved list and the queue from the iPad, so
// check-ins still waiting would be lost. Waiting check-ins are sent first; if any can't be sent (no internet),
// sign-out stops and says how many. Only a gala admin can sign out anyway, after confirming.
import type { CheckInDesk, QueuedCheckIn, SyncResult } from '@shared/offlineCheckin'

export type SignOutCheck = { ok: true } | { ok: false; waiting: number; canForce: boolean }

export async function checkSignOut(
  desk: Pick<CheckInDesk, 'pending' | 'sync'>,
  send: (items: QueuedCheckIn[]) => Promise<SyncResult[]>,
  role: string,
): Promise<SignOutCheck> {
  if (desk.pending().length) await desk.sync(send)
  const waiting = desk.pending().length
  return waiting ? { ok: false, waiting, canForce: role === 'gala_admin' } : { ok: true }
}

/** What the volunteer reads when sign-out is stopped. */
export function waitingMessage(waiting: number, canForce: boolean): string {
  const what = waiting === 1 ? '1 check-in hasn’t' : `${waiting} check-ins haven’t`
  return `${what} reached AAFE yet. Signing out now would delete ${waiting === 1 ? 'it' : 'them'} from this iPad. ` +
    'Connect to the internet and try again' + (canForce ? ', or sign out anyway.' : ', or ask a gala admin.')
}
