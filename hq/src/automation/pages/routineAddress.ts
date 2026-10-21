import { placePath, type PlaceRef } from '../../projects/placeAddresses'

/** A routine open inside the Automation tool of its place — its project, or the person's own Chat (spec §3). */
export const routineAddress = (place: PlaceRef, routineId: string): string =>
  `${placePath(place)}?tool=automation&routine=${encodeURIComponent(routineId)}`
