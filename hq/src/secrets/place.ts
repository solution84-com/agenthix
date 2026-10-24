/**
 * A place is where a secret or a variable belongs: a project, or a person's own storage (ADR-0060), written as the
 * library writes it (`workflows/placeAccess.ts`). The tables write it as `placeType` + `placeId`: `placeWhere`.
 */
import type { WorkflowPlace } from '../workflows/placeAccess'

export type Place = WorkflowPlace

export { isWorkflowPlace as isPlace } from '../workflows/placeAccess'

export const placeWhere = (place: Place) => ({ placeType: place.type, placeId: place.id })

/**
 * What a secret's value is bound to when it is encrypted: its own row's id and its place. A ciphertext copied into
 * another row, or the same row moved to another place, then fails to decrypt instead of being used (spec part 3, S1).
 */
export function secretAssociatedData(secretId: string, place: Place): string {
  return `place-secret\u0000${secretId}\u0000${place.type}\u0000${place.id}`
}
