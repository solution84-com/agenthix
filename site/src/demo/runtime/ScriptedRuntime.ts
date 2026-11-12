import fs from 'node:fs/promises'
import {
  DEFAULT_RUN_LIMITS, pickDemoRunScript, type DemoRunEvent, type DemoRunScript, type DemoScripts, type RunLimitKind, type RunLimits,
} from '@agenthix/core'
import type { AgentRuntime, ConversationRef, RunContext, RunEvent, SessionExistenceQuery } from '../../agents/runtime/types'
import { writeContainedFile } from '../../agents/runtime/containedFile'
import { computeRiskLevel, type RiskRule } from '../../agents/runtime/riskRating'
import { recordToolCall } from '../../agents/runtime/toolGate'
import { demoScriptsOnSite } from './demoScripts'
import { finalText, stateResultToHq } from './statedResult'
import { handOverToReview } from './handOver'

type ToolCallEvent = Extract<RunEvent, { type: 'tool_call' }>

export interface ScriptedRuntimeDeps {
  scripts: () => Promise<DemoScripts>
  /** Resolves after `ms`, or at once when `signal` aborts. */
  wait: (ms: number, signal: AbortSignal | undefined) => Promise<void>
  /** States a task run's result to hq. */
  stateResult?: (context: RunContext, result: string) => Promise<void>
  /** Writes a tool call into the run's tool-call log, as the tool gate does for a harness's call. */
  recordCall?: (context: RunContext, call: ToolCallEvent) => Promise<void>
  /** Hands a completed run's task over for review, as its agent would. */
  handOver?: (context: RunContext) => Promise<void>
  /** Stops the run at a limit, as the engine's limit watch does, so it ends as a real run stopped there. */
  stopAtLimit?: (context: RunContext, limit: RunLimitKind, limits: RunLimits) => Promise<void>
}

/** The tool gate's own record of an allowed call, with its risk rated as the gate rates it. */
export async function recordScriptedCall(context: RunContext, call: ToolCallEvent): Promise<void> {
  const rules = (context.riskRules ?? []) as unknown as RiskRule[]
  const riskLevel = computeRiskLevel(call.toolName, call.toolInput, rules)
  await recordToolCall(context, { toolName: call.toolName, input: call.toolInput, toolUseId: call.toolUseId }, { riskLevel, blocked: false })
}

// Loaded when used: the engine imports the runtimes, and through them this module.
async function stopAtLimitInEngine(context: RunContext, limit: RunLimitKind, limits: RunLimits): Promise<void> {
  const { agentEngine } = await import('../../agents/runtime/AgentEngine')
  await agentEngine.stopAtLimit(context.runId, limit, limits)
}

export function waitUnlessAborted(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve()
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done)
  })
}

const NO_SCRIPT = "This agent has no scripted run in the demo."

/**
 * The demo's stand-in for a harness: plays a run script from the demo's data folder instead of running a model, and
 * touches nothing but the run's own workspace. The harness's pieces around it (queue, transcript, frames) are the
 * real ones.
 *
 * A script is found by the run's task key, then the agent's default. The dispatch carries no task type name, so a
 * script written for a task type is reached only as the agent's default does.
 *
 * It ends as a harness's run would: each tool call written to the run's tool-call log, a completed task run stating its
 * result and handing its task over for review, and a run that ends on a limit stopped by that limit through the
 * engine, never failed.
 */
export class ScriptedRuntime implements AgentRuntime {
  constructor(private readonly deps: ScriptedRuntimeDeps = { scripts: demoScriptsOnSite, wait: waitUnlessAborted }) {}

  // A scripted conversation holds no harness state, so there is nothing to lose and nothing to resume.
  async sessionExists(_query: SessionExistenceQuery): Promise<boolean> { return true }
  async conversationIdle(_conversation: ConversationRef): Promise<void> {}
  async endConversation(_conversation: ConversationRef): Promise<void> {}

  async *run(context: RunContext): AsyncIterable<RunEvent> {
    const signal = context.abortSignal
    let script: DemoRunScript | null
    try {
      const scripts = await this.deps.scripts()
      const agent = scripts.agents[context.agent.handle]
      script = agent ? pickDemoRunScript(agent.runs, { taskKey: context.ownTask?.key ?? undefined }) : null
    } catch (err) {
      yield { type: 'status', status: 'failed', error: `The demo's scripts could not be read: ${err instanceof Error ? err.message : String(err)}` }
      return
    }

    yield { type: 'status', status: 'running', model: context.model }
    if (!script) {
      yield { type: 'text_delta', textDelta: NO_SCRIPT }
      yield { type: 'status', status: 'completed', model: context.model }
      return
    }

    const played: RunEvent[] = []
    for (const event of script.events) {
      await this.deps.wait(event.afterMs, signal)
      if (signal?.aborted) return
      const runEvent = toRunEvent(event)
      played.push(runEvent)
      if (runEvent.type === 'tool_call') await this.record(context, runEvent)
      yield runEvent
    }

    try {
      await writeFiles(context.workingTreeDir, script)
    } catch (err) {
      yield { type: 'status', status: 'failed', error: `The demo could not write the run's files: ${err instanceof Error ? err.message : String(err)}` }
      return
    }
    if (signal?.aborted) return

    const { end } = script
    // A completed task run states its result before it ends (hq takes it only from a run still going), as a
    // harness's agent does; a failed or limit-stopped run states none.
    if (end.status === 'completed') {
      const result = context.taskId ? finalText(played) : null
      if (result) await (this.deps.stateResult ?? stateResultToHq)(context, result)
      if (context.taskId) await (this.deps.handOver ?? handOverToReview)(context)
      yield { type: 'status', status: 'completed', model: context.model }
    } else if (end.status === 'failed') yield { type: 'status', status: 'failed', error: end.error, model: context.model }
    // Stopped, it says nothing more: the engine records the stop and its limit as for any run stopped there.
    else await (this.deps.stopAtLimit ?? stopAtLimitInEngine)(context, end.limit, context.runLimits ?? DEFAULT_RUN_LIMITS)
  }

  /** A call the log cannot take does not stop the run: a harness's run goes on as well. */
  private async record(context: RunContext, call: ToolCallEvent): Promise<void> {
    await (this.deps.recordCall ?? recordScriptedCall)(context, call).catch(() => {})
  }
}

function toRunEvent(event: DemoRunEvent): RunEvent {
  const { afterMs: _afterMs, ...body } = event
  return body
}

async function writeFiles(root: string, script: DemoRunScript): Promise<void> {
  if (script.files.length === 0) return
  await fs.mkdir(root, { recursive: true })
  for (const file of script.files) await writeContainedFile(root, file.path, file.content, file.path)
}

export const scriptedRuntime = new ScriptedRuntime()
