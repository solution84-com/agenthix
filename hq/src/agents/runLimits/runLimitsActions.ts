import { HttpError, prisma } from 'wasp/server'
import type { RunLimits } from '@agenthix/core'
import { requireRole } from '../../server/identity/requireRole'
import { requireProjectAdmin, requireProjectMember } from '../../projects/membership'
import {
  RunLimitsValidationError,
  getOrgRunLimits,
  getProjectRunLimits,
  validateOrgRunLimits,
  validateProjectRunLimits,
} from './runLimitsService'

type Ctx = { user?: { id: string } | null }

export type ProjectRunLimitsResult = {
  org: RunLimits
  /** The project's own choice as stored; null where it chose nothing. */
  own: { timeLimitMinutes: number | null; turnLimit: number | null }
}

function asBadRequest(err: unknown): never {
  if (err instanceof RunLimitsValidationError) throw new HttpError(400, err.message)
  throw err
}

/** The org's run limits: any signed-in person may read them, so a form can show what a project may tighten. */
export const getOrgRunLimitsQuery = async (_args: unknown, context: Ctx): Promise<RunLimits> => {
  if (!context.user) throw new HttpError(401)
  return getOrgRunLimits()
}

export const updateOrgRunLimits = async (args: RunLimits, context: Ctx): Promise<RunLimits> => {
  await requireRole(context, 'ADMIN', 'Changing the run limits')
  let values: RunLimits
  try { values = validateOrgRunLimits(args) } catch (err) { return asBadRequest(err) }
  const data = { runTimeLimitMinutes: values.timeLimitMinutes, runTurnLimit: values.turnLimit }
  const existing = await prisma.org.findFirst({ select: { id: true } })
  if (existing) await prisma.org.update({ where: { id: existing.id }, data })
  else await prisma.org.create({ data: { name: 'My Organisation', ...data } })
  return values
}

export const getProjectRunLimitsQuery = async (
  { projectId }: { projectId: string },
  context: Ctx,
): Promise<ProjectRunLimitsResult> => {
  if (!context.user) throw new HttpError(401)
  await requireProjectMember(projectId, context.user.id, "Reading this project's run limits")
  return { org: await getOrgRunLimits(), own: await getProjectRunLimits(projectId) }
}

export const setProjectRunLimits = async (
  args: { projectId: string; timeLimitMinutes: number | null; turnLimit: number | null },
  context: Ctx,
): Promise<ProjectRunLimitsResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireProjectAdmin(args.projectId, context.user.id, "Changing this project's run limits")
  const org = await getOrgRunLimits()
  let own: ProjectRunLimitsResult['own']
  try { own = validateProjectRunLimits(args, org) } catch (err) { return asBadRequest(err) }
  await prisma.project.update({
    where: { id: args.projectId },
    data: { runTimeLimitMinutes: own.timeLimitMinutes, runTurnLimit: own.turnLimit },
  })
  return { org, own }
}
