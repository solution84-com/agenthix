/**
 * Who may do what with a place's secrets and variables (spec part 3, *Who changes it*): its administrators write —
 * a project's admins, or the person for their own storage — and its members read names, descriptions and variables'
 * values. Who administers a place is the library's rule (`workflows/placeAccess.ts`), so the people who approve a
 * place's workflows are the people who keep its secrets. Refusals here are the store's own, so they carry its codes.
 */
import { mayAdministerPlace, mayReadPlace, placeAdministrators } from '../workflows/placeAccess'
import type { Place } from './place'
import { refuse } from './refusal'

export { mayAdministerPlace, mayReadPlace, placeAdministrators }

export async function requireAdministerPlace(place: Place, userId: string, what: string): Promise<void> {
  if (await mayAdministerPlace(place, userId)) return
  refuse('not_allowed', place.type === 'user'
    ? `${what} is for the person whose own storage this is.`
    : `${what} is for this project's administrators: ask one of them.`)
}

export async function requireReadPlace(place: Place, userId: string, what: string): Promise<void> {
  if (await mayReadPlace(place, userId)) return
  refuse('not_allowed', place.type === 'user'
    ? `${what} is for the person whose own storage this is.`
    : `${what} needs membership of this project: ask one of its administrators.`)
}
