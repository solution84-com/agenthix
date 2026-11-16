/**
 * The tool adapter (conversation layer spec, Tool execution contract): presents hq's foreground tools to the
 * lead under the turn's capability and runs each call through the one tool entry, `callOperation`, with the
 * turn as its caller.
 *
 * A report turn is offered no tools, and a call it makes anyway is refused.
 *
 * A tool the agent may use only by asking (Ask) is offered with a required `reason`, and a call of it does not
 * run: it waits for a person's answer (work/toolCalls/ask.ts) and the lead is told `waitingApproval`.
 *
 * A call waits up to the wait limit. Past it — or when the turn is stopped while it waits — the same call is
 * detached, never cancelled or started again: the lead gets `accepted` with the operation's id, and when the
 * call ends it is settled like any operation and the mailbox writes its card. A call detached because a person
 * stopped or interrupted the turn gets its card and no report turn: the person cut the turn that asked.
 */
import { z } from 'zod'
import { callOperation } from '../../server/controlplane/operations'
import { Logger } from '../../server/utils/logger'
import { ControlPlaneError } from '../../server/controlplane/types'
import { allowOnce, isReadTool, isTurnTool, turnToolAsks, turnToolRefusal, turnToolState } from '../../server/controlplane/turnCaller'
import { CONTROL_PLANE_TOOLS, WORKFORCE_TOOLS } from '../../server/controlplane/toolSchemas'
import type { ConversationTool, LeadToolCall, LeadToolDefinition, MailboxSink, OperationEnd, SettleOperation, ToolAdapter, ToolCallOutcome, TurnCapability } from '../contract'
import { capResult, idempotencyKey, toolCallTitle, turnTool, turnToolDefinitions } from './turnTools'
import { commissioner, operationRows, type ToolCallSettlement, type ToolOperationRows } from './operationRows'
import { conversationTool, conversationTools } from '../work/registry'
import { ASK_NOTE, askFirst, withReason, type AskInput } from '../work/toolCalls/ask'
import { settleOperation } from '../coordinator/mailbox'
import { withTaskId } from '../../server/controlplane/taskKey'
import { actionWriter, type ActionWriter, type TaskFacts } from './actionLines'
import { leanTool, leanToolsFor } from './leanTaskTools'

export interface ToolAdapterDeps {
  rows: ToolOperationRows
  call: (name: string, capability: TurnCapability, args: unknown) => Promise<unknown>
  /** A call at Ask: its operation waits for a person's answer. */
  ask: (input: AskInput) => Promise<ToolCallOutcome>
  /** Ends a detached call's operation, once, and tells the mailbox. */
  settle: SettleOperation
  /** Writes the action line and task card of a call that changed something; absent, a call writes none. */
  actions?: ActionWriter
  /** Replaces a task given by its key, in a call's arguments, with its id; a key that names no task throws a refusal. */
  resolveTask?: <T>(args: T) => Promise<T>
  /** Where a failure no person should read is reported. */
  logError: (message: string, err: unknown) => void
}

type Ended = { ok: true; result: unknown } | { ok: false; refusal: string } | { ok: false; failure: unknown }

/** What a person or the lead reads of a failure: a refusal's own words, never an internal error's. */
function settlementOf(name: string, ended: Ended): ToolCallSettlement {
  if (ended.ok) return { state: 'COMPLETED', result: capResult(ended.result) }
  return { state: 'FAILED', error: 'refusal' in ended ? ended.refusal : `${name} failed` }
}

/** A detached call's end, as its completion card and the lead read it. */
function endOf(settlement: ToolCallSettlement, noReport: boolean): OperationEnd {
  const end: OperationEnd = settlement.state === 'COMPLETED'
    ? { state: 'COMPLETED', result: { summary: typeof settlement.result === 'string' ? settlement.result : JSON.stringify(settlement.result) } }
    : { state: 'FAILED', error: settlement.error }
  return noReport ? { ...end, noReport: true } : end
}

/** A person stopped the turn, or interrupted it with a message: not the wait limit, and not recovery. */
function cutByPerson(signal: AbortSignal): boolean {
  return signal.aborted && (signal.reason === 'stop' || signal.reason === 'interrupt')
}

/** The control plane's tools a turn may ever call, for offering those at Ask. */
const TURN_TOOL_SCHEMAS = [...CONTROL_PLANE_TOOLS, ...WORKFORCE_TOOLS].filter(t => isTurnTool(t.name))

/** Whether the turn may call this conversation tool only by asking: at Ask, and offered once a person says yes. */
async function ownToolAsks(tool: ConversationTool, capability: TurnCapability): Promise<boolean> {
  return turnToolState(capability.permissions, tool.name) === 'ask' && (await tool.offered(allowOnce(capability, tool.name)))
}

function askDefinition(name: string, description: string, input: z.ZodType): LeadToolDefinition {
  return { name, description: `${description}\n\n${ASK_NOTE}`, input: withReason(input) }
}

/** Splits the reason the card shows from the call's own arguments. */
function reasonApart(data: unknown): { args: Record<string, unknown>; reason: string } {
  const { reason, ...args } = data as Record<string, unknown> & { reason: string }
  return { args, reason }
}

function argumentRefusal(name: string, error: z.ZodError): ToolCallOutcome {
  const problems = error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
  return { status: 'refused', reason: `The arguments do not fit ${name}: ${problems}` }
}

/** Resolves 'ended' when the call ends first, 'detach' when the wait limit passes or the turn is stopped first. */
function waitFor(running: Promise<Ended>, waitLimitMs: number, signal: AbortSignal): Promise<'ended' | 'detach'> {
  return new Promise(resolve => {
    const timer = setTimeout(() => finish('detach'), waitLimitMs)
    const onAbort = () => finish('detach')
    function finish(how: 'ended' | 'detach') {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(how)
    }
    signal.addEventListener('abort', onAbort)
    void running.then(() => finish('ended'))
  })
}

/** A control-plane tool as the lead is offered it: in its lean versions where it has them (leanTaskTools.ts). */
function leanOffers(defs: readonly LeadToolDefinition[], asks: boolean): LeadToolDefinition[] {
  return defs.flatMap(d => {
    const lean = leanToolsFor(d.name)
    if (lean.length === 0) return [d]
    return lean.map(l => (asks ? askDefinition(l.name, l.description, z.object(l.schema)) : { name: l.name, description: l.description, input: z.object(l.schema) }))
  })
}

/**
 * The tools the lead is offered under this capability, `own` the conversation's own tools: what a turn's toolsFor
 * gives, and what the model checks (__modelchecks__) send, with the few whose description reads the database scripted.
 */
export async function leadToolDefinitions(capability: TurnCapability, own: readonly ConversationTool[]): Promise<LeadToolDefinition[]> {
  // A report turn speaks and starts no work: it is offered nothing.
  if (capability.trigger === 'REPORT') return []
  // A conversation's own version of a tool (run_task, create_task) replaces the control plane's for a turn.
  const offers = await Promise.all(own.map(async t => {
    if (await t.offered(capability)) return { tool: t, asks: false }
    return (await ownToolAsks(t, capability)) ? { tool: t, asks: true } : null
  }))
  const offered = offers.filter((t): t is NonNullable<typeof t> => t !== null)
  const ownNames = new Set(own.map(t => t.name))
  const asking = TURN_TOOL_SCHEMAS
    .filter(t => !ownNames.has(t.name) && turnToolAsks(capability, t.name))
    .map(t => askDefinition(t.name, t.description ?? `${toolCallTitle(t.name)}.`, z.object(t.schema)))
  return [
    ...leanOffers(turnToolDefinitions(capability).filter(t => !ownNames.has(t.name)), false),
    ...leanOffers(asking, true),
    ...(await Promise.all(offered.map(async ({ tool, asks }) => {
      const description = await tool.describe(capability)
      return asks ? askDefinition(tool.name, description, tool.input) : { name: tool.name, description, input: tool.input }
    }))),
  ]
}

export function createToolAdapter(deps: ToolAdapterDeps): ToolAdapter {
  /** The line for a call that completed; a failure to write it never fails the call. */
  async function recordAction(capability: TurnCapability, call: LeadToolCall, result: unknown, removed: TaskFacts | null): Promise<void> {
    try {
      await deps.actions?.write(capability, call.name, call.input ?? {}, result, removed)
    } catch (err) {
      deps.logError(`Could not write the action line of ${call.name} in turn ${capability.turnId}`, err)
    }
  }

  return {
    async toolsFor(capability) {
      return leadToolDefinitions(capability, conversationTools())
    },

    // Only the control plane's read tools are known to change nothing; a conversation's own tools may write.
    readsOnly(capability, call) {
      if (capability.trigger === 'REPORT' || conversationTool(call.name)) return false
      return isReadTool(call.name) && turnToolRefusal(capability, call.name) === null
    },

    async call(capability: TurnCapability, call: LeadToolCall, options: { waitLimitMs: number; signal: AbortSignal; mailbox: MailboxSink }): Promise<ToolCallOutcome> {
      if (capability.trigger === 'REPORT') return { status: 'refused', reason: 'This reply presents what came back and calls no tools' }
      const own = conversationTool(call.name)
      if (own) {
        const asks = !(await own.offered(capability))
        if (asks && !(await ownToolAsks(own, capability))) return { status: 'refused', reason: `${call.name} is not available in this reply` }
        if (options.signal.aborted) return { status: 'refused', reason: 'The reply was stopped before the call started' }
        if (!asks) {
          const outcome = await own.run(capability, call.input ?? {}, { signal: options.signal })
          if (outcome.status === 'done') await recordAction(capability, call, outcome.result, null)
          return outcome
        }
        const parsed = withReason(own.input).safeParse(call.input ?? {})
        if (!parsed.success) return argumentRefusal(call.name, parsed.error)
        return deps.ask({ capability, toolName: call.name, ...reasonApart(parsed.data) })
      }
      // A lean tool runs its control-plane tool, under that tool's name from here on: its permission, row and line.
      const lean = leanTool(call.name)
      const name = lean?.runs ?? call.name
      const tool = turnTool(name)
      if (!tool) return { status: 'refused', reason: `${call.name} is not available in a conversation` }
      const schema = lean?.schema ?? tool.schema
      if (turnToolAsks(capability, name)) {
        if (options.signal.aborted) return { status: 'refused', reason: 'The reply was stopped before the call started' }
        const parsed = withReason(z.object(schema)).safeParse(call.input ?? {})
        if (!parsed.success) return argumentRefusal(call.name, parsed.error)
        return deps.ask({ capability, toolName: name, ...reasonApart(parsed.data) })
      }
      const refusal = turnToolRefusal(capability, name)
      if (refusal) return { status: 'refused', reason: refusal }
      if (!commissioner(capability)) return { status: 'refused', reason: 'This turn acts for no one' }
      if (options.signal.aborted) return { status: 'refused', reason: 'The reply was stopped before the call started' }
      const typed = z.object(schema).safeParse(call.input ?? {})
      if (!typed.success) return argumentRefusal(call.name, typed.error)
      let parsed: typeof typed
      try {
        parsed = { ...typed, data: deps.resolveTask ? await deps.resolveTask(typed.data) : typed.data }
      } catch (err) {
        if (err instanceof ControlPlaneError) return { status: 'refused', reason: err.message }
        throw err
      }

      const admitted = await deps.rows.admit({
        capability,
        toolName: name,
        idempotencyKey: idempotencyKey(name, parsed.data),
        title: toolCallTitle(name),
        args: parsed.data,
      })
      // The same call is already running: this is that one, and nothing starts again.
      if (admitted.alreadyRunning) return { status: 'accepted', operationId: admitted.operationId }
      const { operationId } = admitted

      const removed = (await deps.actions?.before(name, parsed.data).catch(() => null)) ?? null
      const running: Promise<Ended> = deps.call(name, capability, parsed.data).then(
        result => ({ ok: true as const, result }),
        (err: unknown) => {
          if (err instanceof ControlPlaneError) return { ok: false as const, refusal: err.message }
          deps.logError(`${name} failed in operation ${operationId}`, err)
          return { ok: false as const, failure: err }
        },
      )

      if ((await waitFor(running, options.waitLimitMs, options.signal)) === 'ended') {
        const ended = await running
        const settlement = settlementOf(name, ended)
        await deps.rows.settle(operationId, settlement)
        if (settlement.state === 'COMPLETED') {
          await recordAction(capability, { ...call, name }, ended.ok ? ended.result : undefined, removed)
          return { status: 'done', operationId, result: settlement.result }
        }
        return { status: 'refused', reason: settlement.error }
      }

      await deps.rows.promote(operationId)
      const noReport = cutByPerson(options.signal)
      // Settled once, from whatever state it is in now: a call stopped meanwhile has its result abandoned.
      void running
        .then(ended => deps.settle(operationId, endOf(settlementOf(name, ended), noReport)))
        .catch(err => deps.logError(`Could not record the end of operation ${operationId}`, err))
      return { status: 'accepted', operationId }
    },
  }
}

const logger = new Logger('ConversationTools')

export const toolAdapter: ToolAdapter = createToolAdapter({
  rows: operationRows,
  call: (name, capability, args) => callOperation(name, { kind: 'turn', turn: capability }, args),
  ask: askFirst,
  // Through a function: the mailbox reaches the coordinator, which reaches this adapter.
  settle: (operationId, end) => settleOperation(operationId, end),
  actions: actionWriter,
  resolveTask: withTaskId,
  logError: (message, err) => logger.error(message, err),
})
