/**
 * The per-call authorization gate, the same for every runtime (spec,
 * "Per-call authorization gate", item 2).
 *
 * A harness adapter — Claude's `PreToolUse` hook (sdkToolGate.ts), OpenCode's
 * plugin call — translates the harness's call into a `GateCall` and asks
 * `decideToolCall`, which answers allow, or refuse with the steering text the
 * model is given. On the way it applies the harness path rule, the agent's
 * bash patterns and three-state tool permissions against the run's approved
 * manifest, collects deferred requests, rates the call's risk, and writes the
 * `ToolCallLog` row. Harness-specific refusals (a tool the harness must never
 * offer) stay in the adapter, which records them with `recordToolCall`.
 *
 * It fails closed: an error while deciding is a refusal, and a run stopped
 * before or while a call is decided refuses it (toolGateRuns.ts). A run asked
 * to pause refuses its next call the same way, and is paused there.
 */
import { prisma } from '#db'
import { computeRiskLevel } from './riskRating'
import type { RiskLevel, RiskRule } from './riskRating'
import { getToolState } from './toolPermissions'
import { commandApproved, getBashPatternState } from './bashCommandRules'
import { resolveHarnessPaths, harnessPathRefusalText } from './harnessPathRule'
import type { HarnessPathPolicy, HarnessRealPaths } from './harnessPathRule'
import { gateRunStopped, reachGatePause, untilGateRunStopped } from './toolGateRuns'
import type { RunContext } from './types'
import { FINISHED_RUN_ASKS_TEXT, refusalWhileAsking } from './askingRun'
import { grantPass } from './gatePasses'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('ToolGate')

/** A tool call, as the gate sees it whichever harness made it. */
export interface GateCall {
  /** Canonical name (`read_file`, `bash`, a platform tool's own name), or the harness's own name for a tool with none. */
  toolName: string
  /** The call's arguments as the harness sent them; logged and rated as given. `bash` carries the whole command as `command`. */
  input: unknown
  /** The harness's own id for the call, recorded on the audit row. Opaque. */
  toolUseId?: string
  /** A short label for a deferred request (a file name, a pattern, a URL), or null. */
  target?: string | null
  /** The file paths a harness's own file tool will use, glob patterns allowed; absent for every other tool. */
  paths?: readonly string[]
  /** Other canonical tools whose permission the call also needs, such as `write_file` for a patch that adds a file. */
  alsoRequires?: readonly string[]
  /**
   * A tool every agent has whatever its permissions — the harness's own to-do
   * list, loading a skill staged for the turn. Still refused once the run is
   * stopped, and still recorded.
   */
  permissionFree?: boolean
}

export type GateDecision =
  /**
   * `realPaths`: each of the call's `paths` that leads somewhere other than as
   * written, keyed to where it really leads (harnessPathRule.ts). The adapter
   * hands the harness these in place of the paths the model gave, so a link
   * swapped after the check is not followed; absent when there are none.
   */
  | { allow: true; realPaths?: HarnessRealPaths }
  | { allow: false; reason: string }

export interface GateOptions {
  /** Where the harness's own file tools may not go (harnessPathRule.ts). A call with paths and no policy is refused. */
  harnessPaths?: HarnessPathPolicy
}

/** What a refused call's model is told when its run was stopped. */
export const RUN_STOPPED_TEXT = 'This turn has been stopped, so the call was not run.'
/** What a refused call's model is told when its run pauses there for a scheduled change. */
export const RUN_PAUSED_TEXT = 'This run is pausing here for a scheduled change, so the call was not run. It carries on afterwards.'
const GATE_ERROR_TEXT = 'The call could not be checked, so it was not run. Try again.'

const refuse = (reason: string): GateDecision => ({ allow: false, reason })

/** The longest command a person is asked to approve: the card shows all of it. */
export const MAX_APPROVABLE_COMMAND = 4000
/** The most commands one run asks to have approved. */
export const MAX_REQUESTED_COMMANDS = 20
const COMMAND_TOO_LONG_TEXT =
  `This command was not run: it needs a person's approval, and it is longer than ${MAX_APPROVABLE_COMMAND} characters, too long to ask about. Split it into shorter commands.`
const TOO_MANY_COMMANDS_TEXT =
  `This command was not run: it needs a person's approval, and this run already asks for ${MAX_REQUESTED_COMMANDS} commands. Do not try more commands that need approval in this run.`

/**
 * What a deferred run is told of a call that waits for approval: the work is
 * not done until it has run, so the run must not say it is, nor move its task
 * on (askingRun.ts), and its last message is where the person reads why it asks.
 */
const DEFERRED_TEXT = (what: string) =>
  `${what} was not run: it needs a person's approval, which they are asked for when this run ends. Carry on with ` +
  `the steps that do not need it, and try any other step that does, so everything is asked for together. The work ` +
  `is not finished until what is waiting has been approved and run: do not say it is done, do not state a result ` +
  `and do not move the task on. In your last message, say what is waiting for approval, why it is needed, and what ` +
  `is left to do once it is approved.`

const UNATTENDED_TOOL_TEXT = (name: string) =>
  `${name} needs a person's approval, and this is a scheduled run with nobody to approve it, so it is not available here. Carry on without it.`
const UNATTENDED_BASH_TEXT =
  "This bash command needs a person's approval, and this is a scheduled run with nobody to approve it, so it cannot run here. Carry on without it."

/** Writes the call's `ToolCallLog` row. */
export async function recordToolCall(
  context: Pick<RunContext, 'runId'>,
  call: Pick<GateCall, 'toolName' | 'input' | 'toolUseId'>,
  row: { riskLevel: RiskLevel; blocked: boolean; blockReason?: string },
): Promise<void> {
  await prisma.toolCallLog.create({ data: {
    runId: context.runId,
    toolName: call.toolName,
    toolInput: call.input as object,
    ...(call.toolUseId ? { toolUseId: call.toolUseId } : {}),
    ...row,
  }})
}

/** The gate's decision on one call. Never rejects. */
export async function decideToolCall(context: RunContext, call: GateCall, options: GateOptions): Promise<GateDecision> {
  const stoppedDecision = refuse(RUN_STOPPED_TEXT)
  if (gateRunStopped(context.runId)) {
    await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'run-stopped' }).catch(() => {})
    return stoppedDecision
  }
  if (reachGatePause(context.runId)) {
    await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'run-paused' }).catch(() => {})
    return refuse(RUN_PAUSED_TEXT)
  }
  const decided = decide(context, call, options).catch(async (err: unknown) => {
    logger.error(`[hitl] run=${context.runId} tool=${call.toolName} — gate error, refused: ${err instanceof Error ? err.message : String(err)}`)
    await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'gate-error' }).catch(() => {})
    return refuse(GATE_ERROR_TEXT)
  })
  return untilGateRunStopped(context.runId, decided, stoppedDecision)
}

async function decide(context: RunContext, call: GateCall, options: GateOptions): Promise<GateDecision> {
  const { toolName, input: toolInput } = call

  let realPaths: HarnessRealPaths = {}
  if (call.paths?.length) {
    if (!options.harnessPaths) throw new Error('a call with paths needs the harness path policy')
    const checked = await resolveHarnessPaths(options.harnessPaths, toolName, call.paths)
    if ('refusal' in checked) {
      const { refusal } = checked
      await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: `harness-path-${refusal.why}` })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${toolName} path=${refusal.path.slice(0, 120)} (${refusal.why})`)
      return refuse(harnessPathRefusalText(toolName, refusal))
    }
    realPaths = checked.realPaths
  }

  const denied = call.permissionFree ? null : await checkPermissions(context, call)
  if (denied) return denied
  const whileAsking = refusalWhileAsking(context, toolName, toolInput)
  if (whileAsking) {
    await recordToolCall(context, call, { riskLevel: 'LOW', blocked: true, blockReason: whileAsking.blockReason })
    logger.info(`[deferred] run=${context.runId} tool=${toolName} — refused while asking (${whileAsking.blockReason})`)
    return refuse(whileAsking.reason)
  }

  // A decision the run's stop or pause overtook is recorded as what the harness was told.
  if (gateRunStopped(context.runId)) {
    await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'run-stopped' })
    return refuse(RUN_STOPPED_TEXT)
  }
  if (reachGatePause(context.runId)) {
    await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'run-paused' })
    return refuse(RUN_PAUSED_TEXT)
  }

  const customRules = (context.riskRules ?? []) as unknown as RiskRule[]
  const riskLevel = computeRiskLevel(toolName, toolInput, customRules)
  await recordToolCall(context, call, { riskLevel, blocked: false })
  grantPass(context.runId, toolName, toolInput)
  // Not its input: the log is kept, and can go into a support bundle, which holds no tool call's input (adr-0106).
  logger.info(`[audit] run=${context.runId} tool=${toolName} risk=${riskLevel}`)
  return Object.keys(realPaths).length ? { allow: true, realPaths } : { allow: true }
}

/**
 * The agent's tool states and bash patterns: a refusal, or null to go on.
 * `never` — a tool's, or a bash pattern's — binds every run of a restricted
 * agent, whatever the manifest approves. `ask` is decided against the run's
 * approved manifest; a run with none has nobody to approve,
 * so there `ask` is refused as `never` is (runIsUnattended).
 */
async function checkPermissions(context: RunContext, call: GateCall): Promise<GateDecision | null> {
  if (context.bypassed) return null
  const { toolName, input: toolInput } = call
  const manifest = context.approvedManifest

  if (toolName === 'bash') {
    const cmd = ((toolInput as { command?: string } | null)?.command ?? '').trim()
    const bashToolState = getToolState('bash', context.allowedTools)

    if (bashToolState === 'never') {
      await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'tool-never' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=Bash (state=never)`)
      return refuse('Bash is not available for this agent.')
    }

    // A matching pattern decides; a command none matches follows "Any other command", bash's own state.
    // A never pattern binds every run, whatever bash's state and whatever the manifest approves.
    const patternState = getBashPatternState(cmd, context.allowedBashPatterns ?? [], bashToolState)
    if (patternState === 'never') {
      await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'bash-pattern-never' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=Bash cmd=${cmd.slice(0, 120)} (pattern=never)`)
      return refuse('This bash command pattern is not permitted for this agent.')
    }
    const needsApproval = patternState === 'ask'

    // Unattended (runIsUnattended): nobody can approve an ask
    if (!manifest) {
      if (!needsApproval) return null
      await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'bash-ask-unattended' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=Bash cmd=${cmd.slice(0, 120)} (ask, unattended)`)
      return refuse(UNATTENDED_BASH_TEXT)
    }

    if (needsApproval && !commandApproved(cmd, manifest.bashPatterns)) {
      await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'bash-not-in-manifest' })
      logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${toolName} cmd=${cmd.slice(0, 120)}`)
      if (!context.deferredManifest) return refuse('Bash command does not match any approved pattern for this run.')
      if (context.resultStated) return refuse(FINISHED_RUN_ASKS_TEXT('This command'))
      // A request is the whole command, and an approval grants exactly that command (commandApproved).
      if (cmd.length > MAX_APPROVABLE_COMMAND) return refuse(COMMAND_TOO_LONG_TEXT)
      const asked = context.deferredManifest.bashPatterns
      if (!asked.some(p => p.pattern === cmd)) {
        if (asked.length >= MAX_REQUESTED_COMMANDS) return refuse(TOO_MANY_COMMANDS_TEXT)
        asked.push({ pattern: cmd })
      }
      if (context.immediateApproval) {
        logger.info(`[immediate] run=${context.runId} tool=Bash — blocked, stopping run`)
        return refuse('This command is not approved for this run. Explain what you were trying to do and why you need to run it, then end your turn.')
      }
      logger.info(`[deferred] run=${context.runId} tool=Bash cmd=${cmd.slice(0, 80)} — skipped, continuing`)
      return refuse(DEFERRED_TEXT('This command'))
    }
    return null
  }

  const names = [toolName, ...(call.alsoRequires ?? [])]
  const never = names.find(name => getToolState(name, context.allowedTools) === 'never')
  if (never) {
    await recordToolCall(context, call, { riskLevel: 'FLAGGED', blocked: true, blockReason: 'tool-never' })
    logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${never} (state=never)`)
    return refuse(`${never} is not available for this agent.`)
  }

  // Unattended (runIsUnattended): an ask tool has nobody to approve it
  if (!manifest) {
    const ask = names.find(name => getToolState(name, context.allowedTools) === 'ask')
    if (!ask) return null
    await recordToolCall(context, call, { riskLevel: 'LOW', blocked: true, blockReason: 'tool-ask-unattended' })
    logger.warn(`[hitl] BLOCKED run=${context.runId} tool=${ask} (ask, unattended)`)
    return refuse(UNATTENDED_TOOL_TEXT(ask))
  }

  // Every other tool — always: pass; ask: the manifest decides, else deferred
  if (context.deferredManifest) {
    for (const name of names) {
      const toolState = getToolState(name, context.allowedTools)

      if (toolState === 'ask' && !manifest.tools.includes(name)) {
        if (context.resultStated) {
          await recordToolCall(context, call, { riskLevel: 'LOW', blocked: true, blockReason: 'ask-after-result' })
          return refuse(FINISHED_RUN_ASKS_TEXT(name))
        }
        const existing = context.deferredManifest.tools.find(t => t.name === name)
        const target = call.target ?? null
        if (!existing) {
          context.deferredManifest.tools.push({ name, reason: target ?? undefined })
        } else if (target && !existing.reason?.includes(target)) {
          existing.reason = existing.reason ? `${existing.reason}, ${target}` : target
        }
        await recordToolCall(context, call, { riskLevel: 'LOW', blocked: true, blockReason: 'tool-deferred' })
        if (context.immediateApproval) {
          logger.info(`[immediate] run=${context.runId} tool=${name} — blocked, stopping run`)
          return refuse(`${name} is not available in this run. This action requires approval before it can proceed. Explain what you were trying to do and why you need access to ${name}, then end your turn. The user will review and approve or reject before the run continues.`)
        }
        logger.info(`[deferred] run=${context.runId} tool=${name} — skipped, continuing`)
        return refuse(DEFERRED_TEXT(name))
      }
    }
  }

  return null
}
