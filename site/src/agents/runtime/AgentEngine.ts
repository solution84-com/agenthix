/**
 * Severed from hq/src/agents/runtime/AgentEngine.ts (plan 5d-2 task 7b) — see that
 * file's history for the pre-severance version. Every hq-only Prisma read this
 * file used to do directly is now either:
 *   - pre-resolved by hq at dispatch time and threaded in via
 *     `options.dispatchContext` (core's RunContextPayload), or
 *   - a real read against site's own database, for the four runtime models site
 *     now owns (AgentRun, AgentSession, TranscriptEntry, ToolCallLog), or
 *   - a real HTTPS call across the hq↔site control channel (capability renewal).
 *
 * Severances specific to this file:
 *  - `db: any` (hq's Wasp job-context entities) → site's own `prisma` (`#db`).
 *  - task→projectId (`prisma.task.findUnique`) → `ctx.task.projectId`.
 *  - capability mint (`resolveCapabilityClaims` + `signCapability`, hq's own
 *    identity services) is GONE — hq mints the capability at dispatch time and
 *    hands the JWT over as `options.capabilityJwt`. This file only VERIFIES it,
 *    using site's own `verifyHqToken` (server/identity/verifyHqToken.ts, ADR-0044),
 *    which self-pins the audience to this site's own siteId — the same security
 *    property hq's `verifyHqToken(jwt, 'capability', mintedClaims.siteId)` call
 *    had, reached a different way.
 *  - capability renewal (`renewCapability`, hq's in-process identity service) →
 *    an HTTPS POST to hq's `HQ_CAPABILITY_RENEW_PATH`
 *    (server/hq/capabilityRenewClient.ts's `renewCapabilityViaHq`, review-round
 *    extraction so the transport call sits beside dataClient.ts's `callHqData`
 *    rather than inside the engine), same resolve-hqUrl-from-HqConnection
 *    pattern as that sibling.
 *  - verification is the FIRST statement of the run's try block:
 *    an invalid, expired, or malformed capability must fail before any side
 *    effect — the RUNNING row write, the RUNNING status frame, and the git-key
 *    cleanup all happen only once it succeeds. A capability with no numeric
 *    `exp` claim throws outright rather than defaulting to instantly-expired,
 *    which would otherwise null every in-run MCP resolve with no error anywhere.
 *  - every `globalThis.__wasp_io__` socket emit →
 *    `siteStream.stream(...)` / `siteStream.status(...)` (SiteStreamEmitter.ts).
 *    Run status TRANSITIONS (RUNNING, terminal) become `siteStream.status(...)`
 *    frames, never a stream frame with name 'agentRunStatus' — hq synthesizes
 *    that itself from status frames; a stream copy would double-deliver. The
 *    `run:${runId}` fallback room the original catch block used when `run` was
 *    still null is dropped outright (AgentRun.sessionId is a required column —
 *    there is no run to report status for without one).
 *  - `getSitePublicUrl` (hq's own server URL) → `getAgentFacingSiteUrl` (site's own).
 *  - `credential` and `riskRules` ride into RunContext straight off
 *    `ctx` (RunContextPayload) — see types.ts's severance for why RunContext
 *    grew those fields.
 *
 * Split further at plan 5d-2 T13 (file-size hygiene): the LAUNCH/CONTEXT
 * ASSEMBLY half of `processRun` — capability verification through building the
 * RunContext — moved to runLaunch.ts's `assembleRunLaunch`, at the same seam
 * 5d-1 already used for this file (runQueue.ts, locationResolver.ts,
 * containerPrep.ts, runPersistence.ts). What remains here is the
 * RUN-PROCESSING PIPELINE: invoking `assembleRunLaunch`, the streaming loop,
 * persistence, the terminal frame, and all error handling.
 *
 * Split again at close-out R-071, by responsibility, with no change in behaviour:
 * the streaming loop is runEventLoop.ts, the COMPLETED ending is runCompletion.ts,
 * the FAILED/CANCELLED ending is runFailure.ts and the `finally`'s resource
 * release is runCleanup.ts. What remains here is queueing, dedup, cancellation and
 * the order those pieces run in.
 */
import { runOnBehalfOf, type RunCancelReason, type RunWaitingEvent } from '@agenthix/core'
import { siteStream } from './SiteStreamEmitter'
import { Logger } from '../../server/utils/logger'
import type { RunEvent, RunOptions, RunOutcome } from './types'
import { prisma } from '#db'
import type { AgentSession } from '@prisma/client'
import { startCapabilityRenewal } from './capabilityRenewal'
import { renewCapabilityViaHq } from '../../server/hq/capabilityRenewClient'
import { KeyedAsyncQueue, GlobalSlots } from './runQueue'
import { runQueueKey } from './runQueueKey'
import { assembleRunLaunch, type RunLaunchSink } from './runLaunch'
import { consumeRunEvents, newStreamedRun } from './runEventLoop'
import { completeRun } from './runCompletion'
import { failRun, type FailedTurn } from './runFailure'
import { turnStop, type StopReason } from './turnStop'
import { pauseRun } from './runPause'
import { startRunLimitWatch, type RunLimitWatch } from './runLimitWatch'
import { createRunLaunchSink, releaseRunResources } from './runCleanup'
import { stopGateRun } from './toolGateRuns'
import { conversationLifecycle } from './conversationLifecycle'
import { ConversationClosedError } from './sessionExistenceCheck'
import { siteCeilings } from './containerLimits'
import { hostFigures } from '../../server/host/hostFigures'
import { reportSkippedRunTitle } from './sessionTitleFrame'

/**
 * The site-wide cap on runs executing at once. It protects the machine, not an
 * ordering (ADR-0075): with no queue between conversations, it is the only
 * thing bounding how many harness processes the site starts together — and so
 * how many agent containers are busy at once, which is the host service's
 * `containersAtOnce` ceiling where one runs this site (containerLimits.ts's
 * `siteCeilings`). Default 5; `AGENT_MAX_CONCURRENT_RUNS` overrides it, or
 * narrows the host service's, falling back to the default on an unusable value
 * by the same rule as the container limits.
 */
export function maxConcurrentRuns(): number {
  return siteCeilings().ceilings.containersAtOnce
}

const logger = new Logger('AgentEngine')

export class AgentEngine {
  private queue = new KeyedAsyncQueue()
  private slots = new GlobalSlots(maxConcurrentRuns())

  constructor() {
    // Runs already going keep their slot; a lower cap holds back the next ones, a higher one lets waiting ones start.
    hostFigures.onChange(() => this.slots.setMax(maxConcurrentRuns()))
  }
  private processingRunIds = new Set<string>()
  private abortControllers = new Map<string, AbortController>()
  /** Why a running turn was cancelled, for the turn's own end to record (turnStop.ts). */
  private stopReasons = new Map<string, StopReason>()

  /**
   * Single entry point for all agent runs.
   *
   * queued: true  — chat path: dedup guard on top of the queue; caller fires void
   * queued: false — task path: no dedup and no PENDING gate here (the caller owns
   *                 the lifecycle and processRun re-checks), but the SAME queue
   *
   * BOTH paths queue on the run's SESSION (runQueueKey.ts). A harness transcript
   * has one writer, so a conversation's turns run one after another; everything
   * else — other people, the same person's other conversations in the same
   * container, tasks — runs at once, bounded only by the global slot below.
   *
   * The queue wait happens OUTSIDE the global slot (`runWithSlot` acquires it),
   * so a conversation with a turn waiting behind another never holds
   * concurrency away from anybody else while it waits.
   *
   * The session row is read here, ONCE, and threaded all the way down — the key
   * and the container are two uses of the same row, and a second read after a
   * wait that can run to minutes is what would let them disagree.
   *
   * Resolves with the run's genuine terminal outcome —
   * `undefined` only for the dedup/skip branches below, where nothing was
   * ever written (see types.ts's `RunOutcome` doc comment).
   */
  async run(runId: string, options: RunOptions): Promise<RunOutcome | undefined> {
    // Strip routing-only flag before passing to processRun
    const { queued: _, ...execOptions } = options

    const runWithSlot = async (session: AgentSession | null): Promise<RunOutcome | undefined> => {
      await this.acquireSlot(runId, session)
      try {
        return await this.processRun(runId, execOptions, session)
      } finally {
        this.processingRunIds.delete(runId)
        this.abortControllers.delete(runId)
        this.slots.release()
      }
    }

    if (options.queued === true) {
      // Chat path: dedup, then the session queue
      if (this.processingRunIds.has(runId)) {
        logger.info(`Run ${runId} already in flight. Deduplicating trigger.`)
        return undefined
      }
      this.processingRunIds.add(runId)

      try {
        const run = await prisma.agentRun.findUnique({ where: { id: runId } })
        if (!run || run.status !== 'PENDING') {
          if (run?.status !== 'PENDING') logger.info(`Run ${runId} skipped (status: ${run?.status})`)
          await reportSkippedRunTitle(run, options.dispatchContext.agent, options.sessionTitle)
          this.processingRunIds.delete(runId)
          return undefined
        }
        const session = await this.readSession(runId, run.sessionId)
        const key = runQueueKey(session, runId)
        return await this.queue.enqueue(key, () => runWithSlot(session))
      } catch (err) {
        logger.error(`Execution trigger failed for ${runId}:`, err)
        this.processingRunIds.delete(runId)
        this.abortControllers.delete(runId)
        return undefined
      }
    } else {
      // Task path: the caller owns the lifecycle and the PENDING
      // check is inside processRun, but the queue is the same one.
      // Only the session id is needed from the run row here — the row itself is
      // re-read after the queue wait, deliberately, so a run cancelled while it
      // waited is seen as no longer PENDING and skipped.
      const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { sessionId: true } })
        .catch(() => null)
      const session = run ? await this.readSession(runId, run.sessionId) : null
      const key = runQueueKey(session, runId)
      return await this.queue.enqueue(key, () => runWithSlot(session))
    }
  }

  /**
   * Takes a global slot. A run that has to wait says so to hq (`run.waiting`),
   * and says it has stopped waiting once it holds the slot, so a task can show
   * why it has not started. Nothing is sent for a run that gets a slot at once.
   */
  private async acquireSlot(runId: string, session: AgentSession | null): Promise<void> {
    if (!this.slots.full) { await this.slots.acquire(); return }
    const event = (waiting: boolean): RunWaitingEvent => ({
      runId, sessionId: session?.id ?? '', taskId: session?.taskId ?? null, waiting,
    })
    if (session) siteStream.waiting(event(true))
    await this.slots.acquire()
    if (session) siteStream.waiting(event(false))
  }

  /**
   * The run's session row — the single read every later use is served from.
   *
   * A failure is not re-raised. The run still goes through `processRun`, where a
   * null session becomes a FAILED row and a terminal frame through the ordinary
   * error path, so the caller is told; raising here would instead reject `run()`,
   * which every caller treats as "the engine itself broke". And because the same
   * null is what `runQueueKey` sees, such a run is placed on a key of its own AND
   * is guaranteed to fail before `prepareAgentContainer` — it never enters a
   * container, so it can neither meet another run's drain wait nor have its
   * scratch cleared under it.
   */
  private async readSession(runId: string, sessionId: string): Promise<AgentSession | null> {
    try {
      return await prisma.agentSession.findUnique({ where: { id: sessionId } })
    } catch (err) {
      logger.warn(`Run ${runId}: its session row could not be read (${err instanceof Error ? err.message : String(err)}) — the run will fail`)
      return null
    }
  }

  /**
   * `reason: 'interrupted'` is hq's interrupt-if-busy path
   * (`busyConversationInterrupt.ts`) stopping a running turn to send a new
   * message into the same conversation — recorded distinctly from someone
   * pressing Stop, so the two read differently in the run's history (person-
   * scoped execution spec §2, follow-up). `by` names who did it, when hq says.
   * `'paused'` lets the run finish its step first (runPause.ts).
   */
  async cancelRun(runId: string, reason?: RunCancelReason, by?: string): Promise<void> {
    if (reason === 'paused') return pauseRun(runId, by ?? null, stop => this.stopRun(runId, stop))
    if (reason === 'withdrawn' && await this.withdrawWaitingRun(runId, by)) return
    // The gate first: no call of this run may be allowed once the harness is
    // told to stop, and a harness can have decisions still waiting (toolGateRuns.ts).
    const interrupted = reason === 'interrupted'
    await this.stopRun(runId, by ? { by, interrupted } : interrupted ? 'interrupted' : 'stopped')
  }

  /**
   * A message still waiting behind a running reply, withdrawn by a person
   * (Cancel): its run, not started, is cancelled and its message taken out of
   * the transcript. False when the run has started, which is then stopped as
   * by Stop. The run stays in its queue and is skipped when its turn comes.
   */
  private async withdrawWaitingRun(runId: string, by?: string): Promise<boolean> {
    const { count } = await prisma.agentRun.updateMany({
      where: { id: runId, status: 'PENDING' },
      data: { status: 'CANCELLED', endedAt: new Date(), error: by ? `Withdrawn by ${by}` : 'Withdrawn' },
    })
    if (count === 0) return false
    const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { sessionId: true, taskId: true, agentId: true } })
    await prisma.transcriptEntry.deleteMany({ where: { runId, role: 'USER' } })
    if (run) {
      siteStream.status({
        runId, sessionId: run.sessionId, taskId: run.taskId, agentId: run.agentId, agentHandle: run.agentId,
        status: 'CANCELLED', error: by ? `Withdrawn by ${by}` : 'Withdrawn', sessionPatch: null, manifestPending: null,
      })
    }
    logger.info(`Run ${runId} withdrawn before it started.`)
    return true
  }

  /** The one way a running turn is stopped, whoever stops it: a person, a new message, or a run limit. */
  private async stopRun(runId: string, stopReason: StopReason): Promise<void> {
    stopGateRun(runId)
    const controller = this.abortControllers.get(runId)
    if (controller) {
      logger.info(`Stopping run ${runId} via signal...`)
      controller.abort()
      this.abortControllers.delete(runId)
    }
    const { error } = turnStop(stopReason)
    if (controller) this.stopReasons.set(runId, stopReason)
    // Only a run still pending or running is rewritten: a late or repeated Stop leaves an ended run as it ended.
    const { count } = await prisma.agentRun.updateMany({
      where: { id: runId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', endedAt: new Date(), error }
    }).catch(() => ({ count: 0 }))
    // A Stop that comes while the run is still launching has no controller yet: the reason waits
    // for processRun, which stops the turn before it starts.
    if (!controller && count > 0) this.stopReasons.set(runId, stopReason)
  }

  private async processRun(
    runId: string,
    options: Omit<RunOptions, 'queued'>,
    sessionRow: AgentSession | null,
  ): Promise<RunOutcome | undefined> {
    logger.info(`>>> Processing run ${runId}`)
    const ctx = options.dispatchContext
    // §2a: capability renewal for this run. Declared here (not inside try) so the
    // `finally` below can always stop it, however the try exits — normal completion,
    // thrown error, or an aborted run that falls through to normal completion.
    let renewal: { stop(): void } | null = null
    // The run's time and turn limits, watched from launch to the end of the run.
    let limitWatch: RunLimitWatch | null = null
    // Mutated by assembleRunLaunch (runLaunch.ts) as soon as each value exists —
    // so the `catch`/`finally` below see them even when launch itself throws
    // partway through (see runLaunch.ts's own doc comment for why a mutable sink,
    // not only a success return, carries these across the function boundary).
    // Naming the run's Claude home on it also counts the run in that home, until
    // `releaseRunResources` takes it back out (runCleanup.ts).
    const sink: RunLaunchSink = createRunLaunchSink()
    // Set once this call owns the run: a skipped run may be another call's live one.
    let launched = false
    // The conversation is not idle while this turn runs, and waits here for a
    // release already under way (conversationLifecycle.ts).
    const conversationId = sessionRow?.id ?? null
    if (conversationId) await conversationLifecycle.turnStarting(conversationId)
    let conversationClosed = false
    // Filled as the turn streams, so a turn that throws part way still records what it did.
    const turn: FailedTurn = { streamed: newStreamedRun() }

    try {
      const launch = await assembleRunLaunch(runId, options, ctx, sink, this.abortControllers, sessionRow)
      if (launch.kind === 'skip') {
        await reportSkippedRunTitle(sink.run, ctx.agent, options.sessionTitle)
        return undefined
      }
      launched = true
      const { run, agent, session, context, resolvedModel, runtime, controller } = launch
      conversationLifecycle.turnLaunched(session.id, {
        containerName: launch.containerName, runtime, runStagingServerDir: context.runStaging.serverDir,
      })

      renewal = context.capability
        ? startCapabilityRenewal({
            holder: context.capability,
            renew: async (currentJwt) => renewCapabilityViaHq(currentJwt),
            onError: (err) => logger.warn(`Run ${runId} capability renewal failed (honouring until expiry): ${err.message}`),
          })
        : null

      limitWatch = startRunLimitWatch(options.runLimits, options.startedBy, (kind, limits) => {
        logger.warn(`Run ${runId} reached its ${kind === 'time' ? 'time' : 'turn'} limit — stopping it`)
        void this.stopRun(runId, { limit: kind, limits })
      })
      turn.resolvedModel = resolvedModel
      // A Stop that arrived during launch (before there was a controller to abort) ends the turn before it starts.
      if (this.stopReasons.has(runId)) controller.abort()
      const events: AsyncIterable<RunEvent> = controller.signal.aborted ? (async function* () {})() : runtime.run(context)
      const streamed = await consumeRunEvents(events, {
        runId, sessionId: session.id, taskId: run.taskId ?? null, signal: controller.signal,
        onModelRoundTrip: () => limitWatch?.roundTrip(),
      }, turn.streamed)
      // A stopped turn is CANCELLED, whatever the harness said after the stop.
      const stopped = controller.signal.aborted || streamed.runCancelled
        ? turnStop(this.stopReasons.get(runId))
        : undefined
      if (!stopped && streamed.runFailed) throw new Error(streamed.runError ?? 'Run failed')

      return await completeRun({
        runId, sessionId: session.id, taskId: run.taskId ?? null, agent, resolvedModel, streamed, options, stopped,
        personId: runOnBehalfOf(run.metadata),
      })
    } catch (error) {
      conversationClosed = error instanceof ConversationClosedError
      if (this.stopReasons.has(runId)) turn.stopped = turnStop(this.stopReasons.get(runId))
      return await failRun(runId, error as { name?: string; message?: string }, options, ctx, sink, turn)
    } finally {
      limitWatch?.stop()
      this.stopReasons.delete(runId)
      // The turn is over: the gate allows nothing more for it.
      if (launched) stopGateRun(runId)
      if (conversationId) {
        await conversationLifecycle.turnEnded(conversationId, {
          ended: conversationClosed,
          fallback: { containerName: sink.containerName, runtimeName: sessionRow?.runtime ?? null, runStagingServerDir: sink.runStaging ?? null },
        })
      }
      await releaseRunResources(sink, renewal)
    }
  }
}

export const agentEngine = new AgentEngine()
