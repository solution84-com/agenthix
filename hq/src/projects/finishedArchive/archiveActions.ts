import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../../server/identity/requireRole'
import { requireProjectAdmin, requireProjectMember } from '../membership'
import {
  DEFAULT_ARCHIVE_DAYS, archiveSettingProblem, orgDaysFromStored, orgDaysToStored, type ArchiveAfterDays,
} from './archiveSetting'

type Ctx = { user?: { id: string } | null }

export type OrgArchiveSetting = { days: ArchiveAfterDays }
/** `own` is the project's choice (null: it uses the org's); `org` is the org's default. */
export type ProjectArchiveSetting = { own: ArchiveAfterDays | null; org: ArchiveAfterDays }

async function loadOrgDays(): Promise<ArchiveAfterDays> {
  const org = await prisma.org.findFirst({ select: { archiveFinishedAfterDays: true } })
  return org ? orgDaysFromStored(org.archiveFinishedAfterDays) : DEFAULT_ARCHIVE_DAYS
}

function refuseUnlessChoice(days: unknown): void {
  const problem = archiveSettingProblem(days)
  if (problem) throw new HttpError(400, problem)
}

export const getOrgArchiveSetting = async (_args: unknown, context: Ctx): Promise<OrgArchiveSetting> => {
  if (!context.user) throw new HttpError(401)
  return { days: await loadOrgDays() }
}

export const updateOrgArchiveSetting = async (args: OrgArchiveSetting, context: Ctx): Promise<OrgArchiveSetting> => {
  await requireRole(context, 'ADMIN', "Changing the organisation's archiving of finished tasks")
  refuseUnlessChoice(args.days)
  const data = { archiveFinishedAfterDays: orgDaysToStored(args.days) }
  const existing = await prisma.org.findFirst({ select: { id: true } })
  if (existing) await prisma.org.update({ where: { id: existing.id }, data })
  else await prisma.org.create({ data: { name: 'My Organisation', ...data } })
  return { days: args.days }
}

export const getProjectArchiveSetting = async (
  { projectId }: { projectId: string },
  context: Ctx,
): Promise<ProjectArchiveSetting> => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(projectId, context.user.id, "Reading this project's archiving of finished tasks")
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { archiveFinishedAfterDays: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  return { own: project.archiveFinishedAfterDays as ArchiveAfterDays | null, org: await loadOrgDays() }
}

export const setProjectArchiveSetting = async (
  args: { projectId: string; days: ArchiveAfterDays | null },
  context: Ctx,
): Promise<ProjectArchiveSetting> => {
  if (!context.user) throw new HttpError(401)
  await requireProjectAdmin(args.projectId, context.user.id, "Changing this project's archiving of finished tasks")
  if (args.days !== null) refuseUnlessChoice(args.days)
  await prisma.project.update({ where: { id: args.projectId }, data: { archiveFinishedAfterDays: args.days } })
  return { own: args.days, org: await loadOrgDays() }
}
