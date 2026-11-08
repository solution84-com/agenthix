import { placePath, type PlaceRef } from '../placeAddresses'

/** The Routines section of a place: its project's, or the person's own space's. */
export const ROUTINES_SECTION = 'routines'

/** The routine's own page, inside its place's Routines (the page is its edit screen). */
export const routineHref = (place: PlaceRef, routineId: string): string =>
  `${placePath(place)}?tool=${ROUTINES_SECTION}&routine=${encodeURIComponent(routineId)}`

export const routinesHref = (place: PlaceRef): string => `${placePath(place)}?tool=${ROUTINES_SECTION}`

/**
 * New routine, a focused page of its own (`/projects/:key/routines/new`). The person's own space has no project
 * address, so its key comes with `space=1`: Cancel and Create then go back to the space.
 */
export const newRoutineHref = (projectKey: string, space = false): string =>
  `/projects/${encodeURIComponent(projectKey)}/routines/new${space ? '?space=1' : ''}`

/** The project's Runs, narrowed to routine runs and searched by the routine's name ("All in Runs ›"). */
export const routineRunsHref = (place: PlaceRef, title: string): string =>
  `${placePath(place)}?tool=runs&kind=routine&q=${encodeURIComponent(title)}`

/** A run of a routine opened: its conversation for its person, its line in Runs for anyone else. */
export function routineRunHref(run: { sessionId: string | null; runId: string | null; onBehalfOf: { userId: string } }, me: string): string | null {
  if (run.sessionId && run.onBehalfOf.userId === me) return `/sessions/${encodeURIComponent(run.sessionId)}`
  return run.runId ? `/runs/${encodeURIComponent(run.runId)}` : null
}
