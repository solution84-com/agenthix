/**
 * One `claude` process, kept for one conversation and fed each turn through
 * streaming input — the SDK's ordinary `query()` with a stream of user
 * messages, which its documentation calls the preferred mode (spec §1,
 * adr-0081).
 *
 * What is per turn stays per turn: the gate hook runs in this process and
 * decides each call against the current turn's context; the model is set with
 * `setModel()`; a cancel is `interrupt()`, which ends the turn and keeps the
 * process. Every control call is awaited and its rejection handled — once the
 * process has ended they reject, and an unobserved rejection ends the site.
 *
 * The process ends by closing its input, which the CLI answers by exiting;
 * `close()` then makes sure of it, and in a container kills it by name if it
 * is still there, so a replacement never shares its session file with it.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { query, type HookInput, type Query, type SDKMessage, type SpawnOptions, type SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'
import { Logger } from '../../../server/utils/logger'
import { spawnDockerClaude } from '../DockerSpawner'
import { buildPreToolUseHook } from '../sdkToolGate'
import { RUN_STOPPED_TEXT } from '../toolGate'
import type { RunContext, RunEvent } from '../types'
import { localAnswerOf, reportedModelOf, resultEventOf, retryOf, runEventsOf, type TurnText } from './claudeMessages'
import { retryGiveUp, retryNotice } from '../providerRetry'
import { claudeProcessMemoryMb, killClaudeProcess } from './claudeProcessProbe'
import { removeStagedSkills, type StagedTurnSkills } from './claudeSkills'
import type { ClaudeStart } from './claudeStart'
import { TurnInput } from './turnInput'
import { compactionOf, contextUseOfResult, contextUseOfUsage, tokensOfAssistant, type Compaction } from './claudeMemory'
import { HARNESS_SERVER_KEY_ENV } from '@agenthix/core'
import { issueClaudeKeyTicket, revokeClaudeKeyTicket } from '../../../server/runtime/claudeKeyTickets'
import { clearRelayTurn, issueRelayToken, pointRelayToken, revokeRelayToken, turnModelCredentials } from '../../../server/modelRelay/relayTokens'

const logger = new Logger('ClaudeSDKRuntime')

/** How long an unfinished turn may take to end once it is interrupted, and a closing process to exit. */
const SETTLE_MS = 10_000
const EXIT_WAIT_MS = 3_000
const STDERR_KEPT = 64 * 1024
/** How long a turn's end waits for the process to say how full its memory is. */
const CONTEXT_USAGE_WAIT_MS = 3_000

export type ClaudeProcessInit = {
  conversationId: string
  start: ClaudeStart
  /** How the process opens the session: a new one under this id, or resuming it. */
  session: { sessionId: string } | { resume: string }
  model: string
  containerName: string | null
  /** The skills folder the process was started with; removed when it closes. */
  skills: StagedTurnSkills | null
  /** Called once the process is gone. */
  onClosed?: () => void
}

type GateHook = (input: HookInput) => Promise<Record<string, unknown>>

export class ClaudeProcess {
  readonly conversationId: string
  readonly fingerprint: string
  readonly containerName: string | null
  readonly skills: StagedTurnSkills | null
  model: string
  /** Set when a turn failed: the next turn starts a new process rather than trust this one. */
  replaceBeforeNextTurn = false
  /** Whether the process has run a turn to its result yet. */
  servedTurn = false
  /** Whether the current or last turn got any message back. */
  turnAnswered = false
  /** Resident memory as last measured after a turn; null until one has completed (treated as under the ceiling). */
  lastMemoryMb: number | null = null

  private readonly input = new TurnInput()
  private readonly query: Query
  private readonly messages: AsyncIterator<SDKMessage>
  private readonly onClosed?: () => void
  private child: ChildProcess | null = null
  private exited = false
  /** The docker client or local child is still running: the CLI may be too. */
  private clientRunning = false
  private exitWaiters: Array<() => void> = []
  private stderr = ''
  private gate: GateHook | null = null
  /** The summary the PostCompact hook last handed over, until the turn's compaction takes it. */
  private compactSummary: string | null = null
  private closing: Promise<void> | null = null
  private measuringMemory = false
  private readonly ticket: string | null
  /** The process's token at the model relay, pointed at each of its turns (relayTokens.ts). */
  private readonly relayToken: string | null

  constructor(init: ClaudeProcessInit) {
    this.conversationId = init.conversationId
    this.fingerprint = init.start.fingerprint
    this.containerName = init.containerName
    this.skills = init.skills
    this.model = init.model
    this.onClosed = init.onClosed

    const containerName = init.containerName
    // A relayed process fetches its relay token with a ticket good for one
    // exchange, made for this process alone and dropped when it closes. The
    // token names each turn only while it runs.
    this.relayToken = init.start.relayed && containerName ? issueRelayToken(containerName, init.conversationId) : null
    const ticket = this.relayToken ? issueClaudeKeyTicket(this.relayToken) : null
    this.ticket = ticket
    const execEnv = ticket ? { ...init.start.execEnv, [HARNESS_SERVER_KEY_ENV]: ticket } : init.start.execEnv
    const options: Record<string, unknown> = {
      ...init.start.options,
      ...init.session,
      model: init.model,
      hooks: {
        PreToolUse: [{ hooks: [(input: HookInput) => this.decide(input)] }],
        PostCompact: [{ hooks: [async (input: HookInput) => this.noteCompactSummary(input)] }],
      },
      spawnClaudeCodeProcess: (spawnOptions: SpawnOptions) => this.track(
        containerName ? spawnDockerClaude(containerName, execEnv, spawnOptions) : spawnLocal(spawnOptions),
      ),
    }
    this.query = query({ prompt: this.input, options })
    this.messages = this.query[Symbol.asyncIterator]()
  }

  /** Neither ended nor closing: it can take a turn. */
  get alive(): boolean { return !this.exited && !this.closing }

  get stderrText(): string { return this.stderr }

  /**
   * Measures the process's memory without holding anything up, and keeps the
   * figure for the next turn's check. One measurement at a time; one finishing
   * after the process has ended or been replaced is discarded.
   */
  private measureMemoryInBackground(): void {
    if (this.measuringMemory || !this.alive) return
    this.measuringMemory = true
    void this.memoryMb()
      .then(mb => { if (this.alive) this.lastMemoryMb = mb })
      .catch(() => {})
      .finally(() => { this.measuringMemory = false })
  }

  private memoryMb(): Promise<number | null> {
    if (this.containerName) return claudeProcessMemoryMb({ containerName: this.containerName, conversationId: this.conversationId })
    const pid = this.child?.pid
    return pid ? claudeProcessMemoryMb({ pid }) : Promise.resolve(null)
  }

  /** The model from the next request on. False when the process refused it, which only an ended one does. */
  async setModel(model: string): Promise<boolean> {
    if (model === this.model) return true
    try {
      await this.query.setModel(model)
      this.model = model
      return true
    } catch (err) {
      logger.warn(`[process] conversation=${this.conversationId} setModel(${model}) refused: ${message(err)}`)
      return false
    }
  }

  /** Ends the running turn and keeps the process. Never rejects. */
  async interrupt(): Promise<void> {
    try {
      await this.query.interrupt()
    } catch (err) {
      logger.info(`[cancel] conversation=${this.conversationId} interrupt not delivered: ${message(err)}`)
    }
  }

  /**
   * One turn: the message goes in, and the process's messages come out as run
   * events until the turn's result. The turn's context decides every tool call
   * made meanwhile, and a cancel on its signal interrupts it.
   */
  async *turn(context: RunContext, sdkSessionId: string): AsyncGenerator<RunEvent> {
    const signal = context.abortSignal
    const onAbort = () => { void this.interrupt() }
    let finished = false
    let reportedModel: string | undefined
    let streamed = false
    const turnText: TurnText = { seen: false, breakPending: false, modelResponses: new Set() }
    let gaveUp: string | undefined
    const compactions: Compaction[] = []
    let lastTokens: number | null = null
    this.compactSummary = null
    this.gate = buildPreToolUseHook(context, { skillsDir: this.skills?.visibleDir ?? null, skillNames: this.skills?.names ?? [] })
    if (this.relayToken) pointRelayToken(this.relayToken, context.runId, turnModelCredentials(context))
    this.turnAnswered = false
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      this.input.push(context.prompt)
      if (signal?.aborted) onAbort()
      for (;;) {
        const next = await this.messages.next()
        if (next.done) {
          this.markExited()
          throw new Error(`Claude Code process ended during the turn${this.stderrTail()}`)
        }
        const msg = next.value as Record<string, unknown>
        this.turnAnswered = true
        reportedModel = reportedModelOf(msg) ?? reportedModel
        const compaction = compactionOf(msg)
        if (compaction) { compactions.push(compaction); continue }
        lastTokens = tokensOfAssistant(msg) ?? lastTokens
        const retry = retryOf(msg)
        if (retry && !gaveUp) {
          // Past the bound, the turn is interrupted and its result reported as this failure.
          gaveUp = retryGiveUp(retry) ?? undefined
          if (!gaveUp) yield { type: 'notice', notice: retryNotice(retry) }
          else {
            logger.warn(`[process] conversation=${this.conversationId} giving up on the provider: ${gaveUp}`)
            void this.interrupt()
          }
          continue
        }
        if (msg.type === 'result') {
          finished = true
          this.servedTurn = true
          // A turn the CLI answered itself would otherwise end with nothing said.
          const localAnswer = streamed ? undefined : localAnswerOf(msg)
          if (localAnswer) yield { type: 'text_delta', textDelta: localAnswer }
          const event: RunEvent = gaveUp
            ? { type: 'status', status: 'failed', error: gaveUp }
            : resultEventOf(msg, reportedModel ?? context.model, sdkSessionId)
          if (event.type === 'status' && event.status === 'failed' && !signal?.aborted) this.replaceBeforeNextTurn = true
          for (const c of compactions) {
            yield { type: 'compacted', trigger: c.trigger, summary: this.takeCompactSummary(), tokensBefore: c.tokensBefore }
          }
          const use = await this.contextUse(msg, lastTokens, reportedModel ?? context.model)
          if (use) yield { type: 'context_use', use }
          yield event
          return
        }
        for (const event of runEventsOf(msg, turnText)) {
          if (event.type === 'text_delta') streamed = true
          yield event
        }
      }
    } catch (err) {
      this.markExited()
      throw err
    } finally {
      signal?.removeEventListener('abort', onAbort)
      if (!finished && this.alive) await this.settleUnfinishedTurn()
      if (this.relayToken) clearRelayTurn(this.relayToken, context.runId)
      this.gate = null
      if (finished) this.measureMemoryInBackground()
    }
  }

  /**
   * Ends the process: its input closes and the CLI exits. Anything still there
   * after that is closed by the SDK, and in a container killed by name. Safe
   * to call more than once; never rejects.
   */
  close(): Promise<void> {
    if (!this.closing) {
      this.closing = (async () => {
        this.gate = null
        this.input.end()
        // Read to the end, which the SDK reaches when the CLI has exited.
        void (async () => { while (!(await this.messages.next()).done) { /* discarded */ } })()
          .catch(() => {})
          .finally(() => this.markExited())
        await this.waitUntilGone(EXIT_WAIT_MS)
        if (!this.gone) {
          this.query.close()
          await this.waitUntilGone(EXIT_WAIT_MS)
        }
        // The docker client ends with the exec'd process, so a client still
        // running means the CLI in the container may be too.
        if (this.containerName && this.clientRunning) {
          const killed = await killClaudeProcess(this.containerName, this.conversationId)
          if (killed) logger.warn(`[process] conversation=${this.conversationId} did not exit when closed; killed`)
        }
        if (this.ticket) revokeClaudeKeyTicket(this.ticket)
        if (this.relayToken) revokeRelayToken(this.relayToken)
        if (this.skills) await removeStagedSkills(this.skills.serverDir)
        this.onClosed?.()
      })().catch(err => { logger.warn(`[process] closing conversation=${this.conversationId}: ${message(err)}`) })
    }
    return this.closing
  }

  /**
   * A turn left before its result — cancelled, or its reader gone. Its result
   * is still to come, and must not be read as the next turn's, so the turn is
   * interrupted and read to its end; a process that will not end it is closed.
   */
  private async settleUnfinishedTurn(): Promise<void> {
    await this.interrupt()
    const settled = (async () => {
      for (;;) {
        const next = await this.messages.next()
        if (next.done) { this.markExited(); return false }
        if ((next.value as { type?: string }).type === 'result') return true
      }
    })().catch(() => { this.markExited(); return false })
    const timeout = new Promise<false>(resolve => setTimeout(() => resolve(false), SETTLE_MS).unref())
    if (!(await Promise.race([settled, timeout]))) await this.close()
  }

  private noteCompactSummary(input: HookInput): Record<string, unknown> {
    const summary = (input as { compact_summary?: unknown }).compact_summary
    if (typeof summary === 'string' && summary.trim()) this.compactSummary = summary.trim()
    return {}
  }

  private takeCompactSummary(): string | null {
    const summary = this.compactSummary
    this.compactSummary = null
    return summary
  }

  /**
   * How full the process's memory of the conversation is as the turn ends —
   * asked of the process, else read off the turn's result. Never holds the
   * turn's end up for long, and never rejects.
   */
  private async contextUse(result: Record<string, unknown>, lastTokens: number | null, model: string) {
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), CONTEXT_USAGE_WAIT_MS).unref())
    const asked = (async () => contextUseOfUsage(await this.query.getContextUsage(), new Date()))().catch(() => null)
    return (await Promise.race([asked, timeout])) ?? contextUseOfResult(result, lastTokens, model, new Date())
  }

  private async decide(input: HookInput): Promise<Record<string, unknown>> {
    // Between turns nothing may run: a call arriving then belongs to no turn.
    if (!this.gate) return { decision: 'block', reason: RUN_STOPPED_TEXT }
    return this.gate(input)
  }

  private track(child: ChildProcess): SpawnedProcess {
    this.child = child
    this.clientRunning = true
    child.once('exit', () => {
      this.clientRunning = false
      this.markExited()
    })
    // Read, so a long-lived process never blocks on a full stderr pipe.
    child.stderr?.on('data', (data: Buffer | string) => this.noteStderr(String(data)))
    return child as unknown as SpawnedProcess
  }

  /** Its messages have ended and its client, if one was started, has exited. */
  private get gone(): boolean { return this.exited && !this.clientRunning }

  private markExited(): void {
    this.exited = true
    this.wakeWaiters()
  }

  private wakeWaiters(): void {
    for (const wake of this.exitWaiters.splice(0)) wake()
  }

  private waitUntilGone(ms: number): Promise<void> {
    if (this.gone) return Promise.resolve()
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms)
      timer.unref()
      const check = () => {
        if (this.gone) { clearTimeout(timer); resolve() } else this.exitWaiters.push(check)
      }
      this.exitWaiters.push(check)
    })
  }

  private noteStderr(data: string): void {
    this.stderr = (this.stderr + data).slice(-STDERR_KEPT)
    const line = data.trim()
    if (line) logger.warn(`[stderr] conversation=${this.conversationId} ${line}`)
  }

  private stderrTail(): string {
    const tail = this.stderr.trim().split('\n').slice(-5).join('\n')
    return tail ? `: ${tail}` : ''
  }
}

/** The CLI as a child of this process, for a site running without containers. */
function spawnLocal(options: SpawnOptions): ChildProcess {
  return spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env as NodeJS.ProcessEnv,
    signal: options.signal,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
