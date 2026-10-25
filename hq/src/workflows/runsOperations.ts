/**
 * Runs for people's screens (spec part 5): press Run, stop a run, read a workflow's runs and one run with all of its
 * masked output, read its switches, and change how often an agent may run it. Run and Stop are for anyone in the
 * place who may start runs there — members, not viewers (adr-0102); reading is for any member; the agent's limit is
 * for the place's administrators.
 */
import type {
  GetWorkflowRun, GetWorkflowRuns, GetWorkflowSwitches, SetWorkflowAgentRunsPerHour, StartWorkflowRun, StopWorkflowRun,
} from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { workflowPlace } from './library'
import { requireMayAdministerPlace, requireMayReadPlace } from './placeAccess'
import { startWorkflowRun as start, stopWorkflowRun as stop } from './runs'
import { refreshRunFromSite } from './runsEvents'
import { personRunView, requireRunRow, RUN_VIEW_INCLUDE } from './runsView'
import { listWorkflowSwitches, type WorkflowSwitchEntry } from './switch'

/** The most an administrator may let an agent run one workflow in an hour. */
export const AGENT_RUNS_PER_HOUR_MAX = 1_000
const RUNS_LISTED = 50

function requireUser<T extends { user?: { id: string } | null }>(context: T): string {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user.id
}

function parametersOf(v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Parameters are a value for each parameter, by name. Nothing was changed.')
  return v as Record<string, unknown>
}

export const startWorkflowRun: StartWorkflowRun<{ workflowId: string; workspaceId: string | null; parameters?: Record<string, string> }, { runId: string }> = async (args, context) => {
  const userId = requireUser(context)
  if (typeof args?.workflowId !== 'string' || (args.workspaceId !== null && typeof args.workspaceId !== 'string')) {
    throw new HttpError(400, 'A workflow id and the workspace to run it on are required. Nothing was changed.')
  }
  const place = await workflowPlace(args.workflowId)
  return start({
    place,
    workspace: { ownerType: place.type, ownerId: place.id, workspaceId: args.workspaceId },
    workflow: { id: args.workflowId },
    parameters: parametersOf(args.parameters),
    starter: { kind: 'person', userId },
  })
}

export const stopWorkflowRun: StopWorkflowRun<{ runId: string }, { stopped: boolean }> = async (args, context) => {
  const userId = requireUser(context)
  if (typeof args?.runId !== 'string') throw new HttpError(400, 'A run id is required. Nothing was changed.')
  return stop(args.runId, userId)
}

export const setWorkflowAgentRunsPerHour: SetWorkflowAgentRunsPerHour<{ workflowId: string; perHour: number | null }, { perHour: number | null }> = async (args, context) => {
  const userId = requireUser(context)
  const perHour = args?.perHour
  if (typeof args?.workflowId !== 'string' || !(perHour === null || (Number.isInteger(perHour) && perHour >= 0 && perHour <= AGENT_RUNS_PER_HOUR_MAX))) {
    throw new HttpError(400, `An agent's runs an hour are a whole number from 0 to ${AGENT_RUNS_PER_HOUR_MAX}, or the default. Nothing was changed.`)
  }
  const place = await workflowPlace(args.workflowId)
  await requireMayAdministerPlace(place, { kind: 'person', userId }, 'Changing how often an agent may run a workflow')
  await prisma.workflow.update({ where: { id: args.workflowId }, data: { agentRunsPerHour: perHour } })
  return { perHour }
}

export const getWorkflowRuns: GetWorkflowRuns<{ workflowId: string }, ReturnType<typeof personRunView>[]> = async (args, context) => {
  const userId = requireUser(context)
  if (typeof args?.workflowId !== 'string') throw new HttpError(400, 'A workflow id is required.')
  await requireMayReadPlace(await workflowPlace(args.workflowId), userId, 'Reading this workflow\'s runs')
  const runs = await prisma.workflowRun.findMany({
    where: { workflowId: args.workflowId },
    orderBy: { createdAt: 'desc' },
    take: RUNS_LISTED,
    include: RUN_VIEW_INCLUDE,
  })
  return runs.map(personRunView)
}

export const getWorkflowRun: GetWorkflowRun<{ runId: string }, ReturnType<typeof personRunView>> = async (args, context) => {
  const userId = requireUser(context)
  if (typeof args?.runId !== 'string') throw new HttpError(400, 'A run id is required.')
  const run = await requireRunRow(args.runId)
  await requireMayReadPlace({ type: run.placeType, id: run.placeId }, userId, 'Reading this workflow run')
  if (run.state === 'WAITING' || run.state === 'RUNNING') {
    await refreshRunFromSite(run.id).catch(() => undefined)
    return personRunView(await requireRunRow(run.id))
  }
  return personRunView(run)
}

export const getWorkflowSwitches: GetWorkflowSwitches<{ workflowId: string }, WorkflowSwitchEntry[]> = async (args, context) => {
  const userId = requireUser(context)
  if (typeof args?.workflowId !== 'string') throw new HttpError(400, 'A workflow id is required.')
  await requireMayReadPlace(await workflowPlace(args.workflowId), userId, 'Reading this workflow\'s switches')
  return listWorkflowSwitches(args.workflowId)
}
