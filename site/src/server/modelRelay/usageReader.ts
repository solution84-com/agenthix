/**
 * Reads the vendor's own usage from an answer as the relay passes it on, without holding or changing it (models from
 * one place, part 5, *How each source reports usage*):
 *
 * - Anthropic: `message_start` carries the input and cache counts, `message_delta` the output so far;
 * - OpenAI, OpenRouter and Inworld (and an OpenAI-compatible endpoint): the final chunk's `usage`, or the Responses API's
 *   `response.completed`;
 * - Gemini: `usageMetadata`, the last one carrying the totals.
 *
 * A streamed answer (`text/event-stream`) is read a line at a time, so only a partial line is ever kept. Any other
 * answer is kept up to a limit and read once it ends; beyond the limit it is reported with no usage. Input tokens are
 * counted without the cached ones, which are priced apart (core's `tokenCostMicros`).
 */
import type { UpstreamErrorKind, UsageReport } from '@agenthix/core'
import type { RelayProvider } from './relayProviders'

export type UsageApi = 'anthropic' | 'openai' | 'google'
export type TokenUsage = NonNullable<UsageReport['usage']>

/** The API a relay path speaks. */
export function usageApiFor(provider: RelayProvider): UsageApi {
  switch (provider) {
    case 'anthropic': return 'anthropic'
    case 'google': return 'google'
    case 'openai':
    case 'openrouter':
    case 'openai_compatible':
    case 'inworld':
      return 'openai'
    default: {
      const unknown: never = provider
      throw new Error(`No usage format is known for the provider '${String(unknown)}'`)
    }
  }
}

const BODY_LIMIT = 4 * 1024 * 1024
const LINE_LIMIT = 1024 * 1024
const TEXT_LIMIT = 16 * 1024

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)

/** What an error inside a stream that began well says, in the relay's words. */
function streamErrorKind(type: unknown, code?: unknown): UpstreamErrorKind {
  const t = String(type ?? '')
  const c = typeof code === 'number' ? code : Number(code)
  if (/overloaded|api_error|server_error|unavailable/i.test(t) || c >= 500) return 'unavailable'
  if (/rate_limit/i.test(t) || c === 429) return 'rate-limit'
  if (/quota|billing|credit/i.test(t) || c === 402) return 'quota'
  if (/authentication|permission/i.test(t) || c === 401 || c === 403) return 'auth'
  return 'other'
}

export class UsageReader {
  private readonly streamed: boolean
  private pending = ''
  private skippingLine = false
  private chunks: Buffer[] = []
  private kept = 0
  private overLimit = false
  private start = ''
  private usage: Partial<TokenUsage> = {}
  private seen = false
  /** An error event inside an answer whose status said it worked. */
  streamFailure: UpstreamErrorKind | null = null

  constructor(private readonly api: UsageApi, contentType: string | undefined) {
    this.streamed = /text\/event-stream/i.test(contentType ?? '')
  }

  push(chunk: Buffer): void {
    if (this.start.length < TEXT_LIMIT) this.start += chunk.toString('utf8', 0, Math.min(chunk.length, TEXT_LIMIT - this.start.length))
    if (this.streamed) return this.pushLines(chunk.toString('utf8'))
    if (this.overLimit) return
    this.kept += chunk.length
    if (this.kept > BODY_LIMIT) {
      this.overLimit = true
      this.chunks = []
      return
    }
    this.chunks.push(chunk)
  }

  /** The usage the answer carried, or null when it carried none this reader could read. */
  end(): TokenUsage | null {
    if (this.streamed) {
      if (this.pending && !this.skippingLine) this.line(this.pending)
      this.pending = ''
    } else if (!this.overLimit && this.chunks.length) {
      try {
        const body: unknown = JSON.parse(Buffer.concat(this.chunks).toString('utf8'))
        for (const event of Array.isArray(body) ? body : [body]) this.event(event)
      } catch { /* not JSON: no usage */ }
      this.chunks = []
    }
    if (!this.seen) return null
    const u = this.usage
    return { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0, cacheReadTokens: u.cacheReadTokens ?? 0, cacheWriteTokens: u.cacheWriteTokens ?? 0 }
  }

  /** The start of the answer, for the words of a failure. */
  text(): string {
    return this.start
  }

  private pushLines(text: string): void {
    let rest = this.pending + text
    let nl: number
    while ((nl = rest.indexOf('\n')) !== -1) {
      const line = rest.slice(0, nl)
      rest = rest.slice(nl + 1)
      if (this.skippingLine) this.skippingLine = false
      else this.line(line)
    }
    if (rest.length > LINE_LIMIT) {
      this.skippingLine = true
      rest = ''
    }
    this.pending = this.skippingLine ? '' : rest
  }

  private line(raw: string): void {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!/usage|"error"|"type":\s*"(error|response\.)/.test(data)) return
    try {
      this.event(JSON.parse(data))
    } catch { /* a line that is not JSON carries nothing to count */ }
  }

  private event(value: unknown): void {
    const e = obj(value)
    if (!e) return
    if (this.api === 'anthropic') return this.anthropic(e)
    if (this.api === 'google') return this.take(geminiUsage(obj(e.usageMetadata)))
    return this.openai(e)
  }

  private anthropic(e: Json): void {
    if (e.type === 'error') {
      this.streamFailure = streamErrorKind(obj(e.error)?.type)
      return
    }
    const usage = e.type === 'message_start' ? obj(obj(e.message)?.usage) : obj(e.usage)
    if (!usage) return
    const read = {
      inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens),
      cacheReadTokens: count(usage.cache_read_input_tokens), cacheWriteTokens: count(usage.cache_creation_input_tokens),
    }
    this.take(Object.fromEntries(Object.entries(read).filter(([, n]) => n !== null)) as Partial<TokenUsage>)
  }

  private openai(e: Json): void {
    const error = obj(e.error)
    if (error) this.streamFailure = streamErrorKind(error.type, error.code)
    if (e.type === 'response.failed' || e.type === 'error') this.streamFailure ??= 'other'
    const response = typeof e.type === 'string' && e.type.startsWith('response.') ? obj(e.response) : null
    this.take(openAiUsage(obj((response ?? e).usage)))
  }

  private take(read: Partial<TokenUsage> | null): void {
    if (!read || Object.keys(read).length === 0) return
    this.seen = true
    this.usage = { ...this.usage, ...read }
  }
}

function openAiUsage(u: Json | null): Partial<TokenUsage> | null {
  if (!u) return null
  const chat = u.prompt_tokens !== undefined
  const input = count(chat ? u.prompt_tokens : u.input_tokens)
  const output = count(chat ? u.completion_tokens : u.output_tokens)
  if (input === null || output === null) return null
  const details = obj(chat ? u.prompt_tokens_details : u.input_tokens_details)
  const cacheRead = count(details?.cached_tokens) ?? 0
  const cacheWrite = count(details?.cache_write_tokens) ?? 0
  return { inputTokens: Math.max(0, input - cacheRead - cacheWrite), outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite }
}

function geminiUsage(u: Json | null): Partial<TokenUsage> | null {
  if (!u) return null
  const prompt = count(u.promptTokenCount)
  if (prompt === null) return null
  const cached = count(u.cachedContentTokenCount) ?? 0
  const output = (count(u.candidatesTokenCount) ?? 0) + (count(u.thoughtsTokenCount) ?? 0)
  return { inputTokens: Math.max(0, prompt - cached), outputTokens: output, cacheReadTokens: cached, cacheWriteTokens: 0 }
}
