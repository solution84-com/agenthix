import { HttpError } from 'wasp/server'

/**
 * An operation that names no id at all (or one that is not text) is a malformed request, not a lookup: it is
 * refused as one with the field's name, rather than reaching the database with an undefined key and failing
 * there as a 500.
 */
export function requireId(id: unknown, what: string): asserts id is string {
  if (typeof id !== 'string' || id === '') throw new HttpError(400, `A ${what} id is required`)
}
