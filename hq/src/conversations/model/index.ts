/**
 * The model adapter: direct inference through the AI SDK, one step per call. The only module that names a
 * provider's SDK for conversations.
 */
import { generateText, streamText, type LanguageModel } from 'ai'
import {
  ModelCallError,
  type LeadRequest,
  type LeadStreamEvent,
  type LeadToolCall,
  type ModelAdapter,
  type ResolvedAccess,
  type TurnUsage,
} from '../contract'
import { toModelCallError } from './errors'
import { languageModelFor, type ModelCallExtras } from './providers'
import { leastThinkingFor } from './anthropicThinking'
import { leastReasoningOptions, mergeProviderOptions } from './leastReasoning'
import { callOptions, messagesOf, systemOf, toolsOf } from './prompt'
import { breakpointPositions, cacheKeyOf, cacheStyleOf } from './caching'
import { turnUsageOf } from './usage'
import { recordHqCall } from '../../billing/sources/hqCalls'
import { isDemoMode } from '@agenthix/core'
// Last: the demo's lead reaches the tool registry, whose modules make adapters of their own as they load.
import { demoLeadModel } from '../../demo/lead'

export interface ModelAdapterDeps {
  /** Tests replace this with the SDK's mock models. `call.cacheKey` is the call's conversation, for a turn's calls. */
  languageModel?: (access: ResolvedAccess, extras: ModelCallExtras, call: { cacheKey: string }) => LanguageModel
  /** The SDK's own retries of a rate limit or a server error; 2 unless set. */
  maxRetries?: number
  /** Each call's outcome, for its provider's health (routing/resolver.ts `reportCall`); nothing unless set. */
  report?: (providerId: string, failure: ModelCallError['kind'] | null) => void
  /** Each model call's usage, for its ledger row (billing/); the ledger unless set. */
  record?: (access: ResolvedAccess, usage: TurnUsage) => void
}

/**
 * What the request's provider needs beyond its SDK's own options: OpenRouter's hints go into the body, and so does
 * Anthropic's least thinking on a spoken message's first step.
 */
function extrasOf(request: Omit<LeadRequest, 'tools'>): ModelCallExtras {
  if (request.access.provider === 'anthropic') {
    const thinking = request.firstSpokenStep ? leastThinkingFor(request.access.model) : null
    return thinking ? { anthropicThinking: thinking } : {}
  }
  const style = cacheStyleOf(request.access)
  const noReasoning = (request.spoken === true || request.firstSpokenStep === true) && request.access.provider === 'openrouter'
  if (style.key !== 'session_id') return noReasoning ? { openRouter: { breakpoints: [], noReasoning } } : {}
  return {
    openRouter: {
      breakpoints: style.breakpoints ? breakpointPositions(request) : [], sessionId: cacheKeyOf(request.cacheKey),
      ...(noReasoning ? { noReasoning } : {}),
    },
  }
}

/** Spread into a call: no key at all when there is nothing to send. */
function withProviderOptions<T>(providerOptions: T | undefined): { providerOptions?: T } {
  return providerOptions ? { providerOptions } : {}
}

const FINISH_REASON: Record<string, Extract<LeadStreamEvent, { type: 'finish' }>['reason']> = {
  stop: 'stop',
  'tool-calls': 'tool-calls',
  length: 'length',
}

function toolChoiceOf(choice: LeadRequest['toolChoice']) {
  if (!choice) return {}
  return { toolChoice: choice === 'none' ? ('none' as const) : { type: 'tool' as const, toolName: choice.tool } }
}

/**
 * The vendor's model, or with the demo setting on, the demo's scripted one (ADR-0186): chosen once, when the adapter
 * is made at start, and never a vendor in demo mode. The scripted model itself is reached at the call, since adapters
 * are made while hq's modules are still loading.
 */
function defaultLanguageModel(): NonNullable<ModelAdapterDeps['languageModel']> {
  if (!isDemoMode(process.env)) return languageModelFor
  return (_access, _extras, call) => demoLeadModel()(call.cacheKey)
}

export function createModelAdapter(deps: ModelAdapterDeps = {}): ModelAdapter {
  const modelOf = deps.languageModel ?? defaultLanguageModel()
  const record = deps.record ?? recordHqCall

  function sharedArgs(request: Omit<LeadRequest, 'tools'>) {
    return {
      // One row per model call, written as each step ends: a call that fails after its step used tokens keeps its row.
      onStepFinish: (step: { usage: Parameters<typeof turnUsageOf>[0] }) => record(request.access, turnUsageOf(step.usage)),
      model: modelOf(request.access, extrasOf(request), { cacheKey: request.cacheKey }),
      system: systemOf(request),
      messages: messagesOf(request),
      maxOutputTokens: request.maxOutputTokens,
      abortSignal: request.signal,
      maxRetries: deps.maxRetries,
      ...withProviderOptions(mergeProviderOptions(callOptions(request).providerOptions, leastReasoningOptions(request))),
    }
  }

  async function* stream(request: LeadRequest): AsyncGenerator<LeadStreamEvent> {
    try {
      if (request.signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
      const result = streamText({ ...sharedArgs(request), tools: toolsOf(request.tools), ...toolChoiceOf(request.toolChoice) })
      let finish: LeadStreamEvent | null = null
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (part.text) yield { type: 'text', text: part.text }
        } else if (part.type === 'tool-call') {
          const call: LeadToolCall = { id: part.toolCallId, name: part.toolName, input: part.input }
          yield { type: 'tool-call', call }
        } else if (part.type === 'error') {
          throw part.error
        } else if (part.type === 'abort') {
          throw new ModelCallError('cancelled', 'The reply was stopped.')
        } else if (part.type === 'finish-step') {
          finish = { type: 'finish', reason: FINISH_REASON[part.finishReason] ?? 'other', usage: turnUsageOf(part.usage) }
        }
      }
      if (finish) yield finish
      deps.report?.(request.access.providerId, null)
    } catch (error) {
      throw failed(error, request)
    }
  }

  function failed(error: unknown, request: Omit<LeadRequest, 'tools'>): ModelCallError {
    const e = toModelCallError(error, request.access.provider, request.signal)
    deps.report?.(request.access.providerId, e.kind)
    return e
  }

  return {
    stream,
    async complete(request): Promise<{ text: string; usage: TurnUsage }> {
      try {
        const result = await generateText(sharedArgs(request))
        deps.report?.(request.access.providerId, null)
        return { text: result.text, usage: turnUsageOf(result.usage) }
      } catch (error) {
        throw failed(error, request)
      }
    },
  }
}
