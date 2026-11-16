/** One run of a skills check: the check's message through a model adapter, each tool round answered from the world's script. */
import { taskRunFoldedTools } from '../../../conversations/__modelchecks__/taskRun/setup'
import type { LeadMessage, LeadToolCall, ModelAdapter, ResolvedAccess } from '../../../conversations/contract'
import { answerRead, readCall } from '../../../conversations/__modelchecks__/readCall'
import { RUN_TIME_LIMIT_MS, inputTokensOf, recorded, type RunOptions, type RunRecord } from '../../../conversations/__modelchecks__/run'
import { answer, system, tools } from './skillsWorld'

/** Model calls in one run at most: loading a skill, reading, a proposal, then the answer. */
export const SKILLS_MAX_ROUNDS = 6

export async function runSkillsCheck(
  model: ModelAdapter, access: ResolvedAccess, ask: string, signal = AbortSignal.timeout(RUN_TIME_LIMIT_MS), options: RunOptions = {},
): Promise<RunRecord> {
  const messages: LeadMessage[] = [{ role: 'user', content: ask }]
  const record: RunRecord = { calls: [], texts: [], answer: null, firstRequestTokens: null }
  const offered = tools()
  // find_tools searches the tools the run was offered and not shown, as hq's index does for a run.
  const folded = taskRunFoldedTools()
  for (let round = 0; round < SKILLS_MAX_ROUNDS; round++) {
    let text = ''
    const calls: LeadToolCall[] = []
    for await (const event of model.stream({ access, system: system(), messages, tools: offered, cacheKey: 'skills-check', signal })) {
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
      const read = call.name === 'find_tools' ? call : readCall(call.name, call.input)
      const result = await answerRead(call, folded, (name, input) => answer(name, input && typeof input === 'object' ? (input as Record<string, unknown>) : {}), { embedder: options.embedder ?? null, definitions: [...offered, ...folded] })
      record.calls.push(recorded(round, read, result))
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result })
    }
  }
  return record
}
