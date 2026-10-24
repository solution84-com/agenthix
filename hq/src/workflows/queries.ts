/**
 * The library's queries for people's screens (spec part 5): a place's workflows, one workflow and its versions, one
 * version with its files and its diff against the approved one. Any member of the place may read them, viewers
 * included; nothing they answer holds a secret's value.
 */
import type { GetPlaceWorkflows, GetWorkflow, GetWorkflowVersion } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { isWorkflowPlace, requireMayReadPlace, mayAdministerPlace, type WorkflowPlace } from './placeAccess'
import { listPlaceWorkflows, readVersion, readWorkflow, workflowPlace, type LibraryWorkflow } from './library'

type PlaceArgs = { place: WorkflowPlace }

export const getPlaceWorkflows: GetPlaceWorkflows<PlaceArgs, { workflows: LibraryWorkflow[]; mayAdminister: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (!isWorkflowPlace(args?.place)) throw new HttpError(400, 'A place is a project or a person\'s own storage.')
  await requireMayReadPlace(args.place, context.user.id, 'Reading this place\'s workflows')
  return { workflows: await listPlaceWorkflows(args.place), mayAdminister: await mayAdministerPlace(args.place, context.user.id) }
}

export const getWorkflow: GetWorkflow<{ workflowId: string }, Awaited<ReturnType<typeof readWorkflow>> & { mayAdminister: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.workflowId !== 'string') throw new HttpError(400, 'A workflow id is required.')
  const place = await workflowPlace(args.workflowId)
  await requireMayReadPlace(place, context.user.id, 'Reading this workflow')
  return { ...(await readWorkflow(args.workflowId)), mayAdminister: await mayAdministerPlace(place, context.user.id) }
}

export const getWorkflowVersion: GetWorkflowVersion<{ workflowId: string; number: number }, Awaited<ReturnType<typeof readVersion>>> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.workflowId !== 'string' || !Number.isInteger(args?.number)) throw new HttpError(400, 'A workflow id and a version number are required.')
  const place = await workflowPlace(args.workflowId)
  await requireMayReadPlace(place, context.user.id, 'Reading this workflow')
  return readVersion(args.workflowId, args.number)
}
