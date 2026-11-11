/** What the frame line says of HQ as a whole (ui/DESIGN-SYSTEM.md, *Messages*; decision 4 of the error-message kinds). */
import { clockIn } from '../../sites/scheduled/noticeWords'

/** The live connection is down and reads fail: said once in the frame, for every screen. */
export const HQ_NOT_ANSWERING = 'HQ is not answering. Trying again…'

/** HQ read-only for a move (host-management spec §13): one line, on every screen, until the move is done. */
export function readOnlyLine(since: string, zone: string): string {
  return `HQ is read-only while it moves to a new machine, since ${clockIn(new Date(since), zone)}: you can read everything, but changes made now would not be kept.`
}
