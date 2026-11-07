import {
  APICallError, InvalidArgumentError, InvalidDataContentError, InvalidMessageRoleError, InvalidPromptError, MessageConversionError,
  MissingToolResultsError, UnsupportedFunctionalityError,
} from 'ai'
import { Logger } from '../../server/utils/logger'
import { ModelCallError, type ModelErrorKind, type ModelProvider } from '../contract'

const logger = new Logger('ModelCall')

/** The SDK's own refusals of a request it could not build or does not support: raised before anything is sent. */
const REQUEST_ERRORS = [
  InvalidPromptError, InvalidArgumentError, InvalidDataContentError, InvalidMessageRoleError, MessageConversionError,
  MissingToolResultsError, UnsupportedFunctionalityError,
]

const PROVIDER_NAME: Record<ModelProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
  openai_compatible: 'The model endpoint',
}

const QUOTA_WORDS = /quota|credit balance|insufficient|billing|exceeded your current|out of credit|spend limit/i
const UNREACHABLE_CODES = /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i

/**
 * What happened, naming the provider, then, where only an organisation admin can fix it, one sentence that begins
 * "An organisation admin": the screen words that sentence for whoever reads it (`failureWords.ts`).
 */
function reasonFor(kind: ModelErrorKind, provider: ModelProvider, status: number | undefined): string {
  const name = PROVIDER_NAME[provider]
  switch (kind) {
    case 'auth':
      return `${name} refused the key HQ uses. An organisation admin can check it under Manage organisation › Providers.`
    case 'rate-limit':
      return `${name} is limiting how fast this can run. Wait a moment and send it again.`
    case 'quota':
      return `${name} says the account behind this key is out of credit or over its limit. An organisation admin can check the account, or choose other access under Manage organisation › Providers.`
    case 'unavailable':
      return `${name} could not be reached${status ? ` (it answered with an error, ${status})` : ''}. Try again in a moment.`
    case 'invalid':
      return `${name} did not accept the request${status ? ` (${status})` : ''}. An organisation admin can choose another model under Manage organisation › Providers.`
    case 'request':
      return 'HQ could not build this request, so nothing was sent to the model provider. Try again, and if it keeps happening, tell an organisation admin.'
    case 'cancelled':
      return 'The reply was stopped.'
    case 'other':
      return `${name} could not answer. Try again. An organisation admin can check it under Manage organisation › Providers.`
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
  // The SDK refused to send it: the provider never saw the request, so it is not the provider's failure.
  if (REQUEST_ERRORS.some(refusal => refusal.isInstance(error))) return { kind: 'request' }
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
  if (kind === 'request' || kind === 'other') logger.warn(`A model call failed with no answer from ${provider} (${kind})`, error)
  return new ModelCallError(kind, reasonFor(kind, provider, status), { cause: error })
}
