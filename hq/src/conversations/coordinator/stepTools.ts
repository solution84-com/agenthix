/**
 * One step's tool calls (walkthrough finding 24): all at once, each through the tool adapter under its own wait
 * limit, their results kept in the order asked. The same call asked twice in one step runs once. An operation a
 * call started is then shown in the thread, in that order, as it was when calls ran one after another.
 */
import type { LeadToolCall, MailboxSink, ToolAdapter, ToolCallOutcome, TurnCapability } from '../contract'
import type { OperationLine } from './turn'
import type { StepCall } from './replySteps'
import { toolCallTitle } from '../tools/turnTools'
import { STARTS_WORK } from './startedWords'

export interface StepToolsContext {
  tools: ToolAdapter
  capability: TurnCapability
  waitLimitMs: number
  signal: AbortSignal
  mailbox: MailboxSink
  now(): Date
  log(line: string): void
  hasOperationStarted(operationId: string): Promise<boolean>
  operationLine(operationId: string): Promise<OperationLine | null>
  /** Writes the thread's line for an operation the call started. */
  started(operationId: string, title: string, line: OperationLine | null): Promise<void>
  /** Keeps an operation waiting for a person's answer open in the ledger. */
  waiting(operationId: string, title: string, boundaryName: string | undefined): Promise<void>
}

function sameAsk(call: LeadToolCall): string {
  return `${call.name}\n${JSON.stringify(call.input ?? null)}`
}

export async function runStepTools(ctx: StepToolsContext, calls: readonly LeadToolCall[]): Promise<StepCall[]> {
  const running = new Map<string, Promise<ToolCallOutcome>>()
  const outcomes = await Promise.all(calls.map(call => {
    const key = sameAsk(call)
    let outcome = running.get(key)
    if (!outcome) {
      const asked = ctx.now()
      outcome = ctx.tools.call(ctx.capability, call, { waitLimitMs: ctx.waitLimitMs, signal: ctx.signal, mailbox: ctx.mailbox }).then(o => {
        ctx.log(`turn ${ctx.capability.turnId} tool ${call.name} acknowledged in ${ctx.now().getTime() - asked.getTime()} ms: ${o.status}`)
        return o
      })
      running.set(key, outcome)
    }
    return outcome
  }))

  const done: StepCall[] = []
  for (const [i, call] of calls.entries()) {
    const outcome = outcomes[i]!
    const step: StepCall = { call, outcome }
    // An operation-returning tool, or a call detached past the wait limit: the thread shows it started, and the
    // indicator counts it from here. A tool that starts work started it, or set its task for a time.
    if (outcome.status === 'accepted') {
      const line = await ctx.operationLine(outcome.operationId)
      if (line?.title) step.title = line.title
      if (STARTS_WORK.has(call.name)) {
        step.made = line?.startsAt ? 'set' : 'started'
        if (line?.boundaryName) step.place = line.boundaryName
        if (line?.startsAt) step.startsAt = line.startsAt
      }
      if (!(await ctx.hasOperationStarted(outcome.operationId))) await ctx.started(outcome.operationId, step.title ?? toolCallTitle(call.name), line)
    }
    if (outcome.status === 'waitingApproval') {
      const line = await ctx.operationLine(outcome.operationId)
      if (line?.title) step.title = line.title
      await ctx.waiting(outcome.operationId, line?.title ?? toolCallTitle(call.name), line?.boundaryName)
    }
    done.push(step)
  }
  return done
}
