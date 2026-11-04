import { HttpError } from 'wasp/server'

export const MAX_PROJECT_NAME_LENGTH = 120
export const MAX_PROJECT_DESCRIPTION_LENGTH = 10_000

/** A project's name as stored: text, trimmed, not empty and not long. Every way of making or renaming a project asks it. */
export function checkedProjectName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new HttpError(400, 'A project needs a name')
  if (trimmed.length > MAX_PROJECT_NAME_LENGTH) {
    throw new HttpError(400, `A project name is at most ${MAX_PROJECT_NAME_LENGTH} characters`)
  }
  return trimmed
}

/** A project's description: left out, empty (cleared) or text that is not long; anything else is refused. */
export function checkedProjectDescription(description: unknown): string | null | undefined {
  if (description === undefined || description === null) return description
  if (typeof description !== 'string') throw new HttpError(400, 'A project description must be text')
  if (description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
    throw new HttpError(400, `A project description is at most ${MAX_PROJECT_DESCRIPTION_LENGTH} characters`)
  }
  return description
}

/** A product, programme or default agent a project names: an id, or null for none. */
export function checkedLinkId(value: unknown, what: string): string | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `A ${what} id must be text`)
  return value
}
