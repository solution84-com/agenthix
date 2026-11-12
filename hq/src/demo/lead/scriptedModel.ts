/**
 * The demo's language model (ADR-0186): the AI SDK's model interface, answered from the scripts instead of a vendor.
 * hq's model adapter streams it as it would any model, so the turn, its tools, its record and the screen are the real
 * ones; nothing reaches the network.
 *
 * A model call does not say which turn it is for, so the model counts its calls per conversation: the first call of
 * a turn answers (`firstStep`), every later one closes it (`followUpStep`). Words stream one at a time, 30 ms apart:
 * about the pace a person reads at, so the reply is seen being written.
 */
import { randomUUID } from 'node:crypto'
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Message,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import type { DemoScripts } from '@agenthix/core'
import { SUMMARISER_INSTRUCTION } from '../../conversations/long/summariser'
import { demoSummary, demoTitle, firstStep, followUpStep, leadOf, DEMO_CANNOT_HERE, type DemoStep, type DemoToolResult, type DemoTurn } from './steps'
import { inOwnSpace, type SpaceFor } from './ownSpace'

export const DEMO_MS_PER_WORD = 30

export interface ScriptedModelDeps {
  scripts: () => Promise<DemoScripts>
  /** The turn running in a conversation now; null when none is (a title, a summary, a call from outside one). */
  turnOf: (conversationId: string) => Promise<DemoTurn | null>
  /** Waits between words; tests pass one that does not. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  msPerWord?: number
  /** Makes the visitor's space ready and gives its id, for a call a script makes there (ownSpace.ts); none in tests that make no such call. */
  spaceFor?: SpaceFor
}

const ZERO_USAGE: LanguageModelV3Usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
    const stop = () => { clearTimeout(timer); reject(signal?.reason) }
    signal?.addEventListener('abort', stop, { once: true })
  })
}

function textOf(message: LanguageModelV3Message | undefined): string {
  if (!message || message.role === 'system') return message?.content ?? ''
  return message.content.map(part => (part.type === 'text' ? part.text : '')).join('')
}

/** The results of the tool calls since the model last spoke: what the step after them is answering. */
function trailingResults(prompt: readonly LanguageModelV3Message[]): DemoToolResult[] {
  const results: DemoToolResult[] = []
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i]!
    if (message.role === 'assistant') break
    if (message.role !== 'tool') continue
    for (const part of message.content) {
      if (part.type === 'tool-result') results.unshift({ toolName: part.toolName, output: part.output.type === 'json' ? part.output.value : part.output })
    }
  }
  return results
}

/** The step as this call may make it: only tools it was offered, and none where it may only write words. */
function offeredStep(step: DemoStep, options: LanguageModelV3CallOptions): DemoStep {
  if (step.toolCalls.length === 0) return step
  const offered = new Set((options.tools ?? []).map(t => t.name))
  const wordsOnly = options.toolChoice?.type === 'none'
  if (wordsOnly || step.toolCalls.some(c => !offered.has(c.toolName))) return { text: DEMO_CANNOT_HERE, toolCalls: [] }
  return step
}

/** The reply in pieces of one word each, its spacing kept. */
export function wordPieces(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? []
}

export function createScriptedModel(deps: ScriptedModelDeps) {
  const sleep = deps.sleep ?? wait
  const msPerWord = deps.msPerWord ?? DEMO_MS_PER_WORD
  // Per conversation, the turn last answered and how many calls it has made.
  const steps = new Map<string, { turnId: string; calls: number }>()

  async function stepFor(conversationId: string, options: LanguageModelV3CallOptions): Promise<DemoStep> {
    const [scripts, turn] = await Promise.all([deps.scripts(), deps.turnOf(conversationId)])
    if (!turn) return firstStep(scripts, null)
    const seen = steps.get(conversationId)
    const calls = seen?.turnId === turn.turnId ? seen.calls : 0
    steps.set(conversationId, { turnId: turn.turnId, calls: calls + 1 })
    if (calls > 0) return followUpStep(trailingResults(options.prompt), leadOf(scripts, turn))
    const step = offeredStep(firstStep(scripts, turn), options)
    if (step.toolCalls.length === 0 || !deps.spaceFor) return step
    return { ...step, toolCalls: await inOwnSpace(step.toolCalls, turn, deps.spaceFor) }
  }

  function streamOf(step: DemoStep, signal: AbortSignal | undefined): ReadableStream<LanguageModelV3StreamPart> {
    return new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        try {
          controller.enqueue({ type: 'stream-start', warnings: [] })
          if (step.text) {
            controller.enqueue({ type: 'text-start', id: 't' })
            for (const [i, piece] of wordPieces(step.text).entries()) {
              if (i > 0) await sleep(msPerWord, signal)
              controller.enqueue({ type: 'text-delta', id: 't', delta: piece })
            }
            controller.enqueue({ type: 'text-end', id: 't' })
          }
          for (const call of step.toolCalls) {
            controller.enqueue({ type: 'tool-call', toolCallId: `demo-${randomUUID()}`, toolName: call.toolName, input: JSON.stringify(call.input) })
          }
          const unified = step.toolCalls.length > 0 ? 'tool-calls' : 'stop'
          controller.enqueue({ type: 'finish', finishReason: { unified, raw: unified }, usage: ZERO_USAGE })
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }

  /** The model for one call; `conversationId` is the call's cache key, which a conversation's calls are keyed by. */
  return function modelFor(conversationId: string): LanguageModelV3 {
    return {
      specificationVersion: 'v3',
      provider: 'demo',
      modelId: 'scripted',
      supportedUrls: {},
      async doStream(options) {
        const step = await stepFor(conversationId, options)
        return { stream: streamOf(step, options.abortSignal) }
      },
      // A whole answer is a title or a summary, never a turn's step.
      async doGenerate(options) {
        const last = textOf(options.prompt[options.prompt.length - 1])
        const text = last.includes(SUMMARISER_INSTRUCTION) ? demoSummary() : demoTitle(last)
        return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage: ZERO_USAGE, warnings: [] }
      },
    }
  }
}
