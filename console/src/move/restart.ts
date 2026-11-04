/** What a Fleet Console restart does to the moves it kept (moves.ts). */
import type { PinnedHosts } from '../state/hosts'
import { leaveTargetEmpty } from './target'
import type { Move } from './types'

/**
 * A move still being arranged when the Fleet Console stopped has lost its code (codes live in memory) and ends, as
 * not done: nothing was asked of the old machine yet. Returns the ones that had already armed the new machine and
 * opened hq's transfer, which the caller closes once the link to hq is up (the link is not up when this runs).
 */
export function failRestarted(moves: Move[], hosts: PinnedHosts): Move[] {
  const armed: Move[] = []
  for (const m of moves) {
    if (m.state !== 'waitingForMachine' && m.state !== 'arranging') continue
    m.state = 'failed'
    m.problem = m.joinId
      ? 'The Fleet Console restarted before the new machine was set up, so its code no longer works. Start the move again.'
      : 'The Fleet Console restarted before the new machine was set up. Start the move again.'
    leaveTargetEmpty(hosts, m)
    if (m.transferId) armed.push(m)
  }
  return armed
}
