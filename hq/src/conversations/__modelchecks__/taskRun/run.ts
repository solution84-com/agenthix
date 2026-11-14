/**
 * One run of a task-run check: the run's context and tools sent through a model adapter, each call answered from the
 * script, until the model answers in words, calls set_result, or the rounds run out.
 */
import type { LeadMessage, LeadToolCall, ModelAdapter, ResolvedAccess } from '../../contract'
import { RUN_TIME_LIMIT_MS, type RunRecord } from '../run'
import { answerTaskRun, startState } from './script'
import { taskRunContext, taskRunTools, type TaskRunSetup } from './setup'

/** Model calls in one run at most: looking around, a few edits, the app's tools, a commit and the result. */
export const TASK_RUN_MAX_ROUNDS = 20

export async function runTaskRunCheck(model: ModelAdapter, access: ResolvedAccess, setup: TaskRunSetup, signal = AbortSignal.timeout(RUN_TIME_LIMIT_MS)): Promise<RunRecord> {
  const { system, messages: start } = taskRunContext(setup)
  const tools = taskRunTools(setup)
  const messages: LeadMessage[] = [...start]
  const state = startState(setup.openLivePreview !== null)
  const record: RunRecord = { calls: [], texts: [], answer: null }
  for (let round = 0; round < TASK_RUN_MAX_ROUNDS; round++) {
    let text = ''
    const calls: LeadToolCall[] = []
    for await (const event of model.stream({ access, system, messages, tools, cacheKey: 'task-run-check', signal })) {
      if (event.type === 'text') text += event.text
      else if (event.type === 'tool-call') calls.push(event.call)
    }
    record.texts.push(text)
    if (calls.length === 0) {
      record.answer = text
      return record
    }
    messages.push({ role: 'assistant', content: text, toolCalls: calls })
    for (const call of calls) {
      record.calls.push({ round, name: call.name, input: call.input })
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result: answerTaskRun(call.name, call.input, setup, state) })
    }
    if (calls.some(c => c.name === 'set_result')) {
      record.answer = text
      return record
    }
  }
  return record
}
