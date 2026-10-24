/**
 * The agent's four workflow tools, as hq answers them (workflows spec part 1, *The agent's tools*; adr-0148): forwarded
 * by the site's MCP server to the data path, for the calling run only, whose id the site fills in. The run tells hq
 * the place, the workspace, the agent and the person it is for; the agent can't name another. No tool approves,
 * declines or switches: those are a person's (`approve.ts`, `switch.ts`), and this file reaches neither.
 */
import { HttpError } from 'wasp/server'
import type {
  ListWorkflowsResult, ProposeWorkflowResult, WorkflowRunToolResult, WorkflowRunWorkspace, WorkflowToolArgs,
} from '@agenthix/core'
import { ControlPlaneError, type CallerContext, type ControlPlaneErrorCode } from '../server/controlplane/types'
import { personOfRun } from '../server/controlplane/runOnBehalfOf'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { SecretsRefusal } from '../secrets/refusal'
import { listPlaceWorkflows, toListEntry } from './library'
import { mayReadPlace, mayStartRunsInPlace, type WorkflowPlace } from './placeAccess'
import { proposeWorkflowVersion } from './propose'
import { startWorkflowRun } from './runs'
import { refreshRunFromSite } from './runsEvents'
import { waitForRunEnd } from './runsLive'
import { agentRunView, requireRunRow } from './runsView'

/** How long `run_workflow` and `workflow_run` wait for a run to end; within the site's wait for hq's answer. */
export const RUN_TOOL_WAIT_MS = 10_000

type AgentRun = {
  place: WorkflowPlace
  workspace: WorkflowRunWorkspace
  agentId: string
  agentRunId: string
  sessionId: string
  person: string
}

const CODE: Record<number, ControlPlaneErrorCode> = { 400: 'invalid', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'invalid', 429: 'conflict', 503: 'unavailable' }

/** hq's refusals, as the data path answers them: the words reach the agent as they are. */
async function asTool<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof HttpError) throw new ControlPlaneError(CODE[err.statusCode] ?? 'invalid', err.message)
    if (err instanceof SecretsRefusal) throw new ControlPlaneError('conflict', err.message)
    throw err
  }
}

/** The calling run: it must be this capability's conversation's, and still going. */
async function callingRun(ctx: CallerContext, runId: string | undefined, tool: string): Promise<AgentRun> {
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', `${tool} is for an agent's run`)
  if (!runId) throw new ControlPlaneError('invalid', `${tool} needs the run it is called from, which this site did not say`)
  const { claims } = ctx
  const run = await siteRuntimeStore.getRun(claims.siteId, runId)
  if (!run || run.sessionId !== claims.sessionId || (run.taskId ?? null) !== (claims.taskId ?? null)) {
    throw new ControlPlaneError('forbidden', `${tool} names a run that is not this one`)
  }
  if (run.status !== 'RUNNING' && run.status !== 'PENDING') throw new ControlPlaneError('invalid', 'This run has already ended')
  const person = await personOfRun(claims)
  if (!person) throw new ControlPlaneError('forbidden', `${tool}: this run is on behalf of no one`)
  // A project's run works in the project; a chat in its person's own storage works there (ADR-0060).
  let place: WorkflowPlace
  if (claims.projectId !== null) place = { type: 'project', id: claims.projectId }
  else if (claims.taskId === null) place = { type: 'user', id: claims.userId }
  else throw new ControlPlaneError('forbidden', `${tool}: this run has no place of its own`)
  return {
    place,
    workspace: { ownerType: place.type, ownerId: place.id, workspaceId: claims.workspaceId },
    agentId: claims.agentId,
    agentRunId: run.id,
    sessionId: claims.sessionId,
    person,
  }
}

export async function listWorkflowsOp(ctx: CallerContext, args: { runId?: string }): Promise<ListWorkflowsResult> {
  const run = await callingRun(ctx, args.runId, 'list_workflows')
  if (!(await mayReadPlace(run.place, run.person))) throw new ControlPlaneError('forbidden', 'The person this run is for can\'t read this place\'s workflows')
  return { workflows: (await listPlaceWorkflows(run.place)).map(toListEntry) }
}

export async function proposeWorkflowOp(ctx: CallerContext, args: WorkflowToolArgs['propose_workflow'] & { runId?: string }): Promise<ProposeWorkflowResult> {
  const run = await callingRun(ctx, args.runId, 'propose_workflow')
  if (!(await mayStartRunsInPlace(run.place, run.person))) {
    throw new ControlPlaneError('forbidden', 'The person this run is for only reads this place, so it can\'t propose a workflow. Nothing was changed.')
  }
  return asTool(() => proposeWorkflowVersion({
    place: run.place,
    workspace: run.workspace,
    path: args.path,
    proposer: { kind: 'agent', agentId: run.agentId, agentRunId: run.agentRunId, onBehalfOfUserId: run.person },
  }))
}

async function answerFor(runId: string, wait: boolean): Promise<WorkflowRunToolResult> {
  let row = await requireRunRow(runId)
  if (wait && (row.state === 'WAITING' || row.state === 'RUNNING')) {
    await waitForRunEnd(runId, RUN_TOOL_WAIT_MS)
    row = await requireRunRow(runId)
  }
  if (row.state === 'WAITING' || row.state === 'RUNNING') {
    await refreshRunFromSite(runId).catch(() => undefined)
    row = await requireRunRow(runId)
  }
  return agentRunView(row)
}

export async function runWorkflowOp(ctx: CallerContext, args: WorkflowToolArgs['run_workflow'] & { runId?: string }): Promise<WorkflowRunToolResult> {
  const run = await callingRun(ctx, args.runId, 'run_workflow')
  const { runId } = await asTool(() => startWorkflowRun({
    place: run.place,
    workspace: run.workspace,
    workflow: { name: args.name },
    parameters: args.parameters ?? {},
    starter: { kind: 'agent', agentId: run.agentId, agentRunId: run.agentRunId, onBehalfOfUserId: run.person, sessionId: run.sessionId },
  }))
  return answerFor(runId, true)
}

export async function workflowRunOp(ctx: CallerContext, args: WorkflowToolArgs['workflow_run'] & { runId?: string }): Promise<WorkflowRunToolResult> {
  const run = await callingRun(ctx, args.runId, 'workflow_run')
  if (!(await mayReadPlace(run.place, run.person))) throw new ControlPlaneError('forbidden', 'The person this run is for can\'t read this place\'s workflows')
  const row = await asTool(() => requireRunRow(args.id))
  if (row.placeType !== run.place.type || row.placeId !== run.place.id) {
    throw new ControlPlaneError('not_found', 'There is no such workflow run in this place')
  }
  return answerFor(args.id, true)
}

/** The registry's entries (`server/controlplane/operations.ts`), by tool name. */
export const WORKFLOW_TOOL_OPERATIONS = {
  list_workflows: listWorkflowsOp,
  propose_workflow: proposeWorkflowOp,
  run_workflow: runWorkflowOp,
  workflow_run: workflowRunOp,
}
