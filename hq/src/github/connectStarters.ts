/** Proposing the starter workflows when a repository is connected, so the person who connected it approves them in the same sitting. */
import type { WorkflowPlace } from '../workflows/placeAccess'
import { proposeStarters } from '../workflows/starters/propose'

export type StarterOutcome = { proposed: Awaited<ReturnType<typeof proposeStarters>>; problem: string | null }

/**
 * The repository is connected whether or not this works, so a failure is answered, never thrown: the connection
 * stands and the starters can be proposed again from the Workflows screen.
 */
export async function proposeStartersFor(
  place: WorkflowPlace, workspaceId: string | null, propose: typeof proposeStarters = proposeStarters,
): Promise<StarterOutcome> {
  try {
    return { proposed: await propose(place, { ownerType: place.type, ownerId: place.id, workspaceId }), problem: null }
  } catch (err) {
    return { proposed: [], problem: `The repository is connected, but its starter workflows could not be proposed: ${(err instanceof Error ? err.message : 'unknown failure').replace(/\.+$/, '')}.` }
  }
}
