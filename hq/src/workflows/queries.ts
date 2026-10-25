/**
 * The library's queries for people's screens (spec part 5): a place's workflows, one workflow and its versions, one
 * version with its files and its diff against the approved one. Any member of the place may read them, viewers
 * included; nothing they answer holds a secret's value.
 */
import type { GetPlaceWorkflows, GetWorkflow, GetWorkflowVersion } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { isWorkflowPlace, requireMayReadPlace, mayAdministerPlace, mayStartRunsInPlace, type WorkflowPlace } from './placeAccess'
import { proposingConversations, type ProposedIn } from './proposedIn'
import { listPlaceWorkflows, readVersion, readWorkflow, workflowPlace, type LibraryWorkflow } from './library'

type PlaceArgs = { place: WorkflowPlace }

export const getPlaceWorkflows: GetPlaceWorkflows<PlaceArgs, { workflows: LibraryWorkflow[]; mayAdminister: boolean; mayRun: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (!isWorkflowPlace(args?.place)) throw new HttpError(400, 'A place is a project or a person\'s own storage.')
  await requireMayReadPlace(args.place, context.user.id, 'Reading this place\'s workflows')
  const [workflows, mayAdminister, mayRun] = await Promise.all([
    listPlaceWorkflows(args.place),
    mayAdministerPlace(args.place, context.user.id),
    mayStartRunsInPlace(args.place, context.user.id),
  ])
  return { workflows, mayAdminister, mayRun }
}

type WorkflowRead = Awaited<ReturnType<typeof readWorkflow>>
export type WorkflowDetailView = Omit<WorkflowRead, 'versions'> & {
  versions: (WorkflowRead['versions'][number] & { proposedIn: ProposedIn | null })[]
  mayAdminister: boolean
  mayRun: boolean
}

export const getWorkflow: GetWorkflow<{ workflowId: string }, WorkflowDetailView> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.workflowId !== 'string') throw new HttpError(400, 'A workflow id is required.')
  const place = await workflowPlace(args.workflowId)
  await requireMayReadPlace(place, context.user.id, 'Reading this workflow')
  const read = await readWorkflow(args.workflowId)
  const where = await proposingConversations(read.versions.map((v) => v.proposedByRunId), context.user.id)
  return {
    ...read,
    versions: read.versions.map((v) => ({ ...v, proposedIn: (v.proposedByRunId && where.get(v.proposedByRunId)) || null })),
    mayAdminister: await mayAdministerPlace(place, context.user.id),
    mayRun: await mayStartRunsInPlace(place, context.user.id),
  }
}

export type WorkflowVersionDetail = Awaited<ReturnType<typeof readVersion>> & { proposedIn: ProposedIn | null }

export const getWorkflowVersion: GetWorkflowVersion<{ workflowId: string; number: number }, WorkflowVersionDetail> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.workflowId !== 'string' || !Number.isInteger(args?.number)) throw new HttpError(400, 'A workflow id and a version number are required.')
  const place = await workflowPlace(args.workflowId)
  await requireMayReadPlace(place, context.user.id, 'Reading this workflow')
  const [version, row] = await Promise.all([
    readVersion(args.workflowId, args.number),
    prisma.workflowVersion.findUnique({ where: { workflowId_number: { workflowId: args.workflowId, number: args.number } }, select: { proposedByRunId: true } }),
  ])
  const where = await proposingConversations([row?.proposedByRunId ?? null], context.user.id)
  return { ...version, proposedIn: (row?.proposedByRunId && where.get(row.proposedByRunId)) || null }
}
