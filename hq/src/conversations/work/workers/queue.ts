/**
 * Briefs queue in hq, one at a time per standing worker (conversation layer spec, Conversation activity: briefs
 * to one boundary queue on its one worker). A brief waits as QUEUED; the oldest is taken (ACCEPTED) only when
 * nothing else of that worker is accepted, running or waiting for approval — an approval continues the same
 * session, and a newer run there would replace the request — and is dispatched as a run of the worker's session.
 * When it ends the next is taken. Taking is serialised per worker by a Postgres advisory lock, across processes.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { pickedSkillOf, type PickedSkill } from '@agenthix/core'
import * as dispatchService from '../../../agents/dispatchService'
import * as siteRuntimeStore from '../../../sessions/siteRuntimeStore'
import { SiteUnreachableError } from '../../../storage/workspaceStore'
import { SessionClosedError } from '../../../sessions/closedSession'
import { Logger } from '../../../server/utils/logger'
import type { OperationStateValue } from '../../../shared/conversations/protocol'
import { openJson, openText } from '../../sealing'
import { settleOperation } from '../../coordinator/mailbox'
import { applyWorkerFrame } from './frames'
import { frameOfRun, type WorkerArgs } from './runReads'
import { workerClosedReason } from './standingWorker'
import { placeTakenBrief } from './freshStart'
import { briefOpening, withOpening } from './opening'
import { briefChoice, fellBackLine, keepModelNote } from './workModel'

const logger = new Logger('WorkerQueue')

/** A worker with one of these is busy: the next brief waits. */
export const BUSY_STATES: OperationStateValue[] = ['ACCEPTED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'UNCERTAIN']

/** Takes the worker's oldest queued brief when the worker is free, or null. */
export async function takeNext(workerSessionId: string): Promise<string | null> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('standing-worker'), hashtext(${workerSessionId}))`
    const busy = await tx.operation.findFirst({ where: { workerSessionId, state: { in: BUSY_STATES } }, select: { id: true } })
    if (busy) return null
    const next = await tx.operation.findFirst({
      where: { workerSessionId, state: 'QUEUED' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    })
    if (!next) return null
    await tx.operation.update({ where: { id: next.id }, data: { state: 'ACCEPTED' } })
    return next.id
  })
}

function dispatchFailure(err: unknown, boundaryName: string): string {
  if (err instanceof SiteUnreachableError) return `The site that does the work in ${boundaryName} can't be reached right now.`
  if (err instanceof SessionClosedError) return `Work in ${boundaryName} can't go on here: the agent's session there has closed.`
  if (err instanceof HttpError) return err.message
  return `The work in ${boundaryName} could not be started.`
}

async function boundaryNameOf(op: { boundaryType: string | null; boundaryId: string | null }): Promise<string> {
  if (op.boundaryType !== 'project' || !op.boundaryId) return 'your space'
  return (await prisma.project.findUnique({ where: { id: op.boundaryId }, select: { name: true } }))?.name ?? 'that project'
}

export interface RunInput {
  /** The run's input; the brief itself when absent. */
  text?: string
  hidden?: boolean
  /** Who the run is for: the person who answered an approval; the commissioner when absent. */
  senderId?: string
}

/** The brief as its run reads it: who it is, for whom and where, then what to do. */
async function briefInput(op: { brief: string | null; authorisedById: string; boundaryType: string | null }, agentName: string, boundaryName: string): Promise<string> {
  const person = await prisma.user.findUnique({ where: { id: op.authorisedById }, select: { displayName: true } })
  const opening = briefOpening({
    agentName,
    personName: person?.displayName?.trim() || null,
    projectName: op.boundaryType === 'project' ? boundaryName : null,
  })
  return withOpening(openText(op.brief ?? ''), opening)
}

function pickedSkillOfArgs(args: string | null): PickedSkill | null {
  return args ? pickedSkillOf(openJson<WorkerArgs>(args).skill) : null
}

/** The runtime a taken brief needs, or null when it cannot be read — the brief then runs where it was taken. */
async function neededRuntime(operationId: string): Promise<string | null> {
  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  const session = op?.workerSessionId ? await prisma.agentSession.findUnique({ where: { id: op.workerSessionId } }) : null
  const agent = session ? await prisma.agent.findUnique({ where: { id: session.agentId } }) : null
  return op && session && agent ? (await briefChoice(op, session, agent)).runtime : null
}

/**
 * Dispatches an ACCEPTED operation as a run of its worker, and records the run. False when it could not start, the
 * operation then ended as failed with why. A run that has already ended by the time it is recorded — its frames
 * came before the record — is applied from the site's own row.
 */
export async function dispatchAccepted(operationId: string, input: RunInput = {}): Promise<boolean> {
  const op = await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })
  const boundaryName = await boundaryNameOf(op)
  try {
    const session = op.workerSessionId ? await prisma.agentSession.findUnique({ where: { id: op.workerSessionId } }) : null
    if (!session) throw new Error(`operation ${op.id} names no standing worker`)
    const closed = workerClosedReason(session, boundaryName)
    if (closed) throw new HttpError(409, `${closed.charAt(0).toUpperCase()}${closed.slice(1)}.`)
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: session.agentId } })
    // A run that carries the brief on stays on its session's model (workModel.ts).
    const carriesOn = input.text !== undefined
    const choice = await briefChoice(op, session, agent, carriesOn)
    const { model } = choice
    if (!carriesOn) await keepModelNote(op.id, op.args, await fellBackLine(choice.resolution))
    // The run's credential is resolved for the session's model, so the session carries the one this brief runs on.
    if (model && session.model !== model) await prisma.agentSession.update({ where: { id: session.id }, data: { model } })
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    const text = input.text ?? await briefInput(op, agent.name, boundaryName)
    // The picked skill goes with the brief itself, never with a run that carries it on (an approval's).
    const skill = input.text === undefined ? pickedSkillOfArgs(op.args) : null
    const { runId } = await dispatchService.dispatchChatRun(session.id, text, agent, model, {
      hideUserMessage: input.hidden ?? false,
      senderId: input.senderId ?? op.authorisedById,
      choice,
      ...(skill ? { skill } : {}),
    })
    await recordRun(op.id, siteId, runId)
    return true
  } catch (err) {
    if (!(err instanceof HttpError || err instanceof SiteUnreachableError || err instanceof SessionClosedError)) {
      logger.error(`could not dispatch operation ${op.id}`, err)
    }
    await settleOperation(op.id, { state: 'FAILED', error: dispatchFailure(err, boundaryName) })
    return false
  }
}

async function recordRun(operationId: string, siteId: string, runId: string): Promise<void> {
  const { count } = await prisma.operation.updateMany({ where: { id: operationId, state: 'ACCEPTED' }, data: { state: 'RUNNING', siteId, runId } })
  if (count === 0) {
    // Stopped while it was being started: the run it started is stopped too.
    await siteRuntimeStore.cancelRun(siteId, runId).catch(err => logger.warn(`could not stop run ${runId} of a stopped operation: ${String(err)}`))
    return
  }
  const run = await siteRuntimeStore.getRun(siteId, runId).catch(() => null)
  const frame = run ? frameOfRun(run) : null
  if (frame && frame.status !== 'RUNNING') {
    const outcome = await applyWorkerFrame(frame, siteId)
    if (outcome && !frame.manifestPending) schedulePump(outcome.workerSessionId)
  }
}

/**
 * Starts the worker's queued briefs, one at a time, until one runs or none is left. A brief taken while the worker
 * is free is where a worker past the high mark is started fresh (`freshStart.ts`): its briefs then move to the new
 * session, whose queue goes on from there.
 */
export async function pump(workerSessionId: string): Promise<void> {
  for (;;) {
    const next = await takeNext(workerSessionId)
    if (!next) return
    const movedTo = await neededRuntime(next).then(runtime => placeTakenBrief(workerSessionId, runtime)).catch((err) => {
      logger.warn(`could not check whether worker ${workerSessionId} should start fresh; it carries on: ${String(err)}`)
      return null
    })
    if (movedTo) return pump(movedTo)
    if (await dispatchAccepted(next)) return
  }
}

/** The same, not waited for: a tool returns at once, and a frame's handler does not hold the channel. */
export function schedulePump(workerSessionId: string | null): void {
  if (!workerSessionId) return
  void pump(workerSessionId).catch(err => logger.error(`could not move the queue of worker ${workerSessionId} on`, err))
}
