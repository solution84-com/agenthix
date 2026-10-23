import { APICallError } from 'ai'
import { ModelCallError, type ModelErrorKind, type ModelProvider } from '../contract'

const PROVIDER_NAME: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
  openai_compatible: 'The model endpoint',
}

const QUOTA_WORDS = /quota|credit balance|insufficient|billing|exceeded your current|out of credit|spend limit/i
const UNREACHABLE_CODES = /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i

function reasonFor(kind: ModelErrorKind, provider: ModelProvider, status: number | undefined): string {
  const name = PROVIDER_NAME[provider]
  const subject = provider === 'openai_compatible' ? 'The key for the model endpoint' : `The ${name} key`
  switch (kind) {
    case 'auth':
      return `${subject} was refused — check it in Manage organisation › Providers.`
    case 'rate-limit':
      return `${name} is limiting how fast this can run. Wait a moment and send it again.`
    case 'quota':
      return `${name} says the account behind this key is out of credit or over its limit — check the account, or choose other access in Manage organisation › Providers.`
    case 'unavailable':
      return `${name} could not be reached${status ? ` (it answered with an error, ${status})` : ''}. Try again in a moment.`
    case 'invalid':
      return `${name} did not accept the request${status ? ` (${status})` : ''}. If it keeps happening, choose another model in Manage organisation › Providers.`
    case 'cancelled':
      return 'The reply was stopped.'
    case 'other':
      return `${name} could not answer. Try again, and if it keeps happening, check Manage organisation › Providers.`
  }
}

function classify(error: unknown): { kind: ModelErrorKind; status?: number } {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode
    const text = `${error.message} ${error.responseBody ?? ''}`
    if (status === 401 || status === 403) return { kind: 'auth', status }
    if (status === 402 || (status !== undefined && status < 500 && status !== 429 && QUOTA_WORDS.test(text))) return { kind: 'quota', status }
    if (status === 429) return { kind: QUOTA_WORDS.test(text) ? 'quota' : 'rate-limit', status }
    if (status === undefined || status >= 500) return { kind: 'unavailable', status }
    if (status === 408) return { kind: 'unavailable', status }
    if (status >= 400) return { kind: 'invalid', status }
  }
  const e = error as { name?: string; code?: string; message?: string; cause?: unknown } | null
  if (e && (UNREACHABLE_CODES.test(String(e.code ?? '')) || UNREACHABLE_CODES.test(String(e.message ?? '')))) return { kind: 'unavailable' }
  if (e?.cause && typeof e.cause === 'object') {
    const inner = classify(e.cause)
    if (inner.kind !== 'other') return inner
  }
  if (e?.name === 'LoadAPIKeyError') return { kind: 'auth' }
  return { kind: 'other' }
}

/** Every failure of a model call as one `ModelCallError`; the reason holds no key and none of the provider's own text. */
export function toModelCallError(error: unknown, provider: ModelProvider, signal: AbortSignal): ModelCallError {
  if (error instanceof ModelCallError) return error
  const aborted = signal.aborted || (error as { name?: string } | null)?.name === 'AbortError'
  if (aborted) return new ModelCallError('cancelled', reasonFor('cancelled', provider, undefined), { cause: error })
  const { kind, status } = classify(error)
  return new ModelCallError(kind, reasonFor(kind, provider, status), { cause: error })
}
