/**
 * A project's lead (every screen reviewed spec §9): an optional person, shown in
 * the project's facts. It is a label and grants nothing — what anyone may do in
 * the project is still decided by their project role (membership.ts).
 */
import type { SetProjectLead } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { isProjectMember, requireProjectAdmin } from './membership'
import { refuseOnPersonalProject } from './personalProject'
import { personById } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'

export type ProjectLead = { userId: string; username: string; person: PersonSummary }

export const setProjectLead: SetProjectLead<{ projectId: string; userId: string | null }, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectAdmin(args.projectId, context.user.id, "Choosing this project's lead")
  // Its one person is the only one there is; there is nobody to name.
  await refuseOnPersonalProject(args.projectId, 'Naming a lead')

  const leadUserId = args.userId ?? null
  if (leadUserId !== null && !(await isProjectMember(args.projectId, leadUserId))) {
    throw new HttpError(400, "A project's lead must be a member of the project")
  }
  await prisma.project.update({ where: { id: args.projectId }, data: { leadUserId } })
}

/**
 * The lead as a project's data shows it. Someone who has since left the
 * project is not shown as leading it; the stored choice stays, so it returns
 * if they join again.
 */
export async function projectLeadOf(project: { id: string; leadUserId: string | null }): Promise<ProjectLead | null> {
  if (!project.leadUserId || !(await isProjectMember(project.id, project.leadUserId))) return null
  const person = await personById(project.leadUserId)
  return { userId: person.userId, username: person.name, person }
}
