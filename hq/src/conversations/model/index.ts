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
import { callOptions, messagesOf, systemOf, toolsOf } from './prompt'
import { breakpointPositions, cacheKeyOf, cacheStyleOf } from './caching'
import { turnUsageOf } from './usage'

export interface ModelAdapterDeps {
  /** Tests replace this with the SDK's mock models. */
  languageModel?: (access: ResolvedAccess, extras: ModelCallExtras) => LanguageModel
  /** The SDK's own retries of a rate limit or a server error; 2 unless set. */
  maxRetries?: number
}

/** What the request's provider needs beyond its SDK's own options: OpenRouter's hints go into the body. */
function extrasOf(request: Omit<LeadRequest, 'tools'>): ModelCallExtras {
  const style = cacheStyleOf(request.access)
  const noReasoning = request.spoken === true && request.access.provider === 'openrouter'
  if (style.key !== 'session_id') return noReasoning ? { openRouter: { breakpoints: [], noReasoning } } : {}
  return {
    openRouter: {
      breakpoints: style.breakpoints ? breakpointPositions(request) : [], sessionId: cacheKeyOf(request.cacheKey),
      ...(noReasoning ? { noReasoning } : {}),
    },
  }
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

export function createModelAdapter(deps: ModelAdapterDeps = {}): ModelAdapter {
  const modelOf = deps.languageModel ?? languageModelFor

  function sharedArgs(request: Omit<LeadRequest, 'tools'>) {
    return {
      model: modelOf(request.access, extrasOf(request)),
      system: systemOf(request),
      messages: messagesOf(request),
      maxOutputTokens: request.maxOutputTokens,
      abortSignal: request.signal,
      maxRetries: deps.maxRetries,
      ...callOptions(request),
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
    } catch (error) {
      throw toModelCallError(error, request.access.provider, request.signal)
    }
  }

  return {
    stream,
    async complete(request): Promise<{ text: string; usage: TurnUsage }> {
      try {
        const result = await generateText(sharedArgs(request))
        return { text: result.text, usage: turnUsageOf(result.usage) }
      } catch (error) {
        throw toModelCallError(error, request.access.provider, request.signal)
      }
    },
  }
}
