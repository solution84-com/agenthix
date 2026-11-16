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
import { isReadTool, turnToolAsks, turnToolRefusal } from '../../server/controlplane/turnCaller'
import type { LeadToolCall, MailboxSink, OperationEnd, SettleOperation, ToolAdapter, ToolCallOutcome, TurnCapability } from '../contract'
import { capResult, idempotencyKey, toolCallTitle, turnTool } from './turnTools'
import { commissioner, operationRows, type ToolCallSettlement, type ToolOperationRows } from './operationRows'
import { conversationTool, conversationTools } from '../work/registry'
import { askFirst, withReason, type AskInput } from '../work/toolCalls/ask'
import { settleOperation } from '../coordinator/mailbox'
import { withTaskId } from '../../server/controlplane/taskKey'
import { actionWriter, type ActionWriter, type TaskFacts } from './actionLines'
import { leanTool } from './leanTaskTools'
import { leadToolOffer, offerCache, ownToolAsks } from './leadOffer'
import { FIND_TOOLS, USE_TOOL, inputRefusal, notAToolRefusal } from '@agenthix/core'
import { entryOf, findTools, fold, foldedNames, unwrapUseTool } from './foldedTools'

export { leadToolDefinitions, leadToolOffer } from './leadOffer'
import type { SearchOptions } from '../../tools/search'

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
  /** How find_tools searches; hq's built-in model when absent. */
  search?: SearchOptions
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

function reasonApart(data: unknown): { args: Record<string, unknown>; reason: string } {
  const { reason, ...args } = data as Record<string, unknown> & { reason: string }
  return { args, reason }
}

const problemsOf = (error: z.ZodError): string => error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')

function argumentRefusal(name: string, error: z.ZodError): ToolCallOutcome {
  return { status: 'refused', reason: `The arguments do not fit ${name}: ${problemsOf(error)}` }
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

export function createToolAdapter(deps: ToolAdapterDeps): ToolAdapter {
  /** The line for a call that completed; a failure to write it never fails the call. */
  async function recordAction(capability: TurnCapability, call: LeadToolCall, result: unknown, removed: TaskFacts | null): Promise<void> {
    try {
      await deps.actions?.write(capability, call.name, call.input ?? {}, result, removed)
    } catch (err) {
      deps.logError(`Could not write the action line of ${call.name} in turn ${capability.turnId}`, err)
    }
  }

  const offerOf = offerCache(capability => leadToolOffer(capability, conversationTools()))

  return {
    async toolsFor(capability) {
      return fold(await offerOf(capability)).shown
    },

    async foldedFor(capability) {
      return foldedNames(fold(await offerOf(capability)).folded)
    },

    // Only the control plane's read tools are known to change nothing; a conversation's own tools may write.
    readsOnly(capability, asked) {
      if (capability.trigger === 'REPORT') return false
      if (asked.name === FIND_TOOLS) return true
      const call = unwrapUseTool(asked)
      if (conversationTool(call.name)) return false
      return isReadTool(call.name) && turnToolRefusal(capability, call.name) === null
    },

    async call(capability: TurnCapability, asked: LeadToolCall, options: { waitLimitMs: number; signal: AbortSignal; mailbox: MailboxSink }): Promise<ToolCallOutcome> {
      if (capability.trigger === 'REPORT') return { status: 'refused', reason: 'This reply presents what came back and calls no tools' }
      if (asked.name === FIND_TOOLS) {
        const answer = await findTools(asked.input, fold(await offerOf(capability)).folded, deps.search)
        return { status: 'done', operationId: capability.turnId, result: answer }
      }
      // A use_tool call runs the tool it names, through the path a native call takes, under that tool's name.
      const call = unwrapUseTool(asked)
      if (call.via) {
        const offered = await offerOf(capability)
        const named = offered.find(t => t.name === call.name)
        if (call.name === FIND_TOOLS || call.name === USE_TOOL || !named) {
          return { status: 'refused', reason: notAToolRefusal(call.name) }
        }
        // Input that doesn't fit is answered with the tool's definition, so the model can call again without a search.
        const fits = named.input.safeParse(call.input ?? {})
        if (!fits.success) return { status: 'refused', reason: inputRefusal(entryOf(named), problemsOf(fits.error)) }
      }
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
