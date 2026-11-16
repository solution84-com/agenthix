/**
 * One run of a task-run check: the run's context and tools sent through a model adapter, each call answered from the
 * script, until the model answers in words, calls set_result, or the rounds run out.
 */
import type { LeadMessage, LeadToolCall, ModelAdapter, ResolvedAccess } from '../../contract'
import { answerRead, readCall } from '../readCall'
import { RUN_TIME_LIMIT_MS, inputTokensOf, recorded, type RunOptions, type RunRecord } from '../run'
import { answerTaskRun, startState } from './script'
import { taskRunContext, taskRunFoldedTools, taskRunTools, type TaskRunSetup } from './setup'

/** Model calls in one run at most: looking around, a few edits, the app's tools, a commit and the result. */
export const TASK_RUN_MAX_ROUNDS = 20

export async function runTaskRunCheck(
  model: ModelAdapter, access: ResolvedAccess, setup: TaskRunSetup, signal = AbortSignal.timeout(RUN_TIME_LIMIT_MS), options: RunOptions = {},
): Promise<RunRecord> {
  const { system, messages: start } = taskRunContext(setup)
  const tools = taskRunTools(setup)
  // find_tools searches the tools the run was offered and not shown, as hq's index does for a run.
  const folded = taskRunFoldedTools()
  const shown = new Set(tools.map(t => t.name))
  const messages: LeadMessage[] = [...start]
  const state = startState(setup.openLivePreview !== null)
  const record: RunRecord = { calls: [], texts: [], answer: null, firstRequestTokens: null }
  for (let round = 0; round < TASK_RUN_MAX_ROUNDS; round++) {
    let text = ''
    const calls: LeadToolCall[] = []
    for await (const event of model.stream({ access, system, messages, tools, cacheKey: 'task-run-check', signal })) {
      if (event.type === 'text') text += event.text
      else if (event.type === 'tool-call') calls.push(event.call)
      else if (event.type === 'finish' && round === 0) record.firstRequestTokens = inputTokensOf(event.usage)
    }
    record.texts.push(text)
    if (calls.length === 0) {
      record.answer = text
      return record
    }
    messages.push({ role: 'assistant', content: text, toolCalls: calls })
    for (const call of calls) {
      // A tool the run was not shown is refused, as a harness refuses it: it is reached only through use_tool.
      if (!shown.has(call.name)) {
        record.calls.push({ round, name: `${call.name} (not offered)`, input: call.input })
        messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result: { error: `No such tool: ${call.name}` } })
        continue
      }
      const read = call.name === 'find_tools' ? call : readCall(call.name, call.input)
      const result = await answerRead(call, folded, (name, input) => answerTaskRun(name, input, setup, state), { embedder: options.embedder ?? null, definitions: [...tools, ...folded] })
      record.calls.push(recorded(round, read, result))
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result })
    }
    if (calls.some(c => readCall(c.name, c.input).name === 'set_result')) {
      record.answer = text
      return record
    }
  }
  return record
}
