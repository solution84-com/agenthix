/**
 * One run of a check: the real context and tools sent through a model adapter, each tool round answered from the
 * script, until the model answers in words or the rounds run out. Every call is recorded for the grading.
 */
import type { LeadMessage, LeadToolCall, ModelAdapter, ResolvedAccess, TurnUsage } from '../contract'
import type { Embedder } from '../../memory/contract'
import { STARTS_WORK } from '../coordinator/startedWords'
import { FIND_TOOLS, answerRead, readCall } from './readCall'
import { foundNames } from './trace'
import { answer } from './script'
import { capabilityOf, contextOf, toolOfferOf, type CheckSetup } from './setup'
import { foldedNames } from '../tools/foldedTools'
import { CHECK_NOW } from './world'

/** Model calls in one run at most: enough for a search, a read and a change, then the answer. */
export const MAX_ROUNDS = 5
/** One run's model calls together at most, so a provider that stops answering fails the run instead of hanging it. */
export const RUN_TIME_LIMIT_MS = 3 * 60 * 1000

export interface RecordedCall {
  round: number
  name: string
  input: unknown
  /** For find_tools: the names it answered. */
  found?: string[]
}

/** A call as the record keeps it: a find_tools call with the names its answer gave. */
export function recorded(round: number, call: { name: string; input: unknown }, result: unknown): RecordedCall {
  const found = call.name === FIND_TOOLS ? foundNames(result) : null
  return found ? { round, name: call.name, input: call.input, found } : { round, name: call.name, input: call.input }
}

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

export interface RunOptions {
  /** What find_tools embeds with: hq's built-in model in a real run; words alone when absent (tests on a fake model). */
  embedder?: Embedder | null
}

export async function runCheck(
  model: ModelAdapter, access: ResolvedAccess, setup: CheckSetup, signal = AbortSignal.timeout(RUN_TIME_LIMIT_MS), options: RunOptions = {},
): Promise<RunRecord> {
  const capability = capabilityOf(setup.home, setup.never)
  const { shown: tools, folded } = await toolOfferOf(capability, setup.home, setup.features ?? [])
  const { system, messages: start } = contextOf(setup, CHECK_NOW, foldedNames(folded))
  const read = { embedder: options.embedder ?? null, permitted: [...tools, ...folded].map(t => t.name), definitions: [...tools, ...folded] }
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
      const asked = call.name === FIND_TOOLS ? call : readCall(call.name, call.input)
      const result = await answerRead(call, folded, (name, input) => answer(name, input, capability, setup.home, setup.memory?.items, setup.taskDone ?? false), read)
      record.calls.push(recorded(round, asked, result))
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, result })
    }
    // A step that only started work ends the reply, as it does in a turn.
    if (calls.every(c => STARTS_WORK.has(readCall(c.name, c.input).name))) {
      record.answer = text
      return record
    }
  }
  return record
}
