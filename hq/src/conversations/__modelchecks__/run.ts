/**
 * One run of a check: the real context and tools sent through a model adapter, each tool round answered from the
 * script, until the model answers in words or the rounds run out. Every call is recorded for the grading.
 */
import type { LeadMessage, LeadToolCall, ModelAdapter, ResolvedAccess, TurnUsage } from '../contract'
import { STARTS_WORK } from '../coordinator/startedWords'
import { answerRead, readCall } from './readCall'
import { answer } from './script'
import { capabilityOf, contextOf, toolsOf, type CheckSetup } from './setup'

/** Model calls in one run at most: enough for a search, a read and a change, then the answer. */
export const MAX_ROUNDS = 5
/** One run's model calls together at most, so a provider that stops answering fails the run instead of hanging it. */
export const RUN_TIME_LIMIT_MS = 3 * 60 * 1000

export interface RecordedCall { round: number; name: string; input: unknown }

export interface RunRecord {
  calls: RecordedCall[]
  /** Each round's words, in order. */
  texts: string[]
  /** The words of the round that called no tool, when the run got that far. */
  answer: string | null
  /** The provider's own count of the first model call's input (cache reads and writes included); null when it gave none. */
  firstRequestTokens?: number | null
}

/** A call's input as the total the provider counted: the part not cached and the parts read from and written to the cache. */
export const inputTokensOf = (usage: TurnUsage): number => usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens

export async function runCheck(model: ModelAdapter, access: ResolvedAccess, setup: CheckSetup, signal = AbortSignal.timeout(RUN_TIME_LIMIT_MS)): Promise<RunRecord> {
  const capability = capabilityOf(setup.home)
  const { system, messages: start } = contextOf(setup)
  const tools = await toolsOf(capability, setup.home, setup.features ?? [])
  const messages: LeadMessage[] = [...start]
  const record: RunRecord = { calls: [], texts: [], answer: null, firstRequestTokens: null }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let text = ''
    const calls: LeadToolCall[] = []
    for await (const event of model.stream({ access, system, messages, tools, cacheKey: capability.conversationId, signal })) {
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
      record.calls.push({ round, name: read.name, input: read.input })
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result: await answerRead(call, tools, (name, input) => answer(name, input, capability, setup.home, setup.memory?.items)) })
    }
    // A step that only started work ends the reply, as it does in a turn.
    if (calls.every(c => STARTS_WORK.has(readCall(c.name, c.input).name))) {
      record.answer = text
      return record
    }
  }
  return record
}
