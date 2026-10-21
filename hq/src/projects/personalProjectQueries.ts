import type { GetMyPersonalProject } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { ensurePersonalProject, type PersonalProjectRef } from './personalProject'

/**
 * The caller's own personal project, for the shell's "My tasks" entry. It is
 * created here if account creation or boot did not manage to — every person
 * always has one (spec §4) — and only ever the caller's: there is no argument
 * that could name anyone else's.
 */
export const getMyPersonalProject: GetMyPersonalProject<void, PersonalProjectRef> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return ensurePersonalProject(context.user.id)
}
