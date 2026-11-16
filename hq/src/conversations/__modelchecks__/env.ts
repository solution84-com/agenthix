/**
 * The access the checks run on, from the environment only. Without it every check is skipped, with one line saying
 * what to set. The key is never written anywhere.
 */
import type { ModelProvider, ResolvedAccess } from '../contract'

const PROVIDERS: readonly ModelProvider[] = ['anthropic', 'openai', 'google', 'openrouter', 'openai_compatible', 'inworld']
export const DEFAULT_RUNS = 3

export const SKIP_LINE =
  'Model checks skipped: set MODEL_CHECK_PROVIDER (one of ' + PROVIDERS.join(', ') + '), MODEL_CHECK_MODELS ' +
  '(model ids, comma-separated) and MODEL_CHECK_API_KEY; MODEL_CHECK_BASE_URL for openai_compatible; ' +
  `MODEL_CHECK_RUNS for each check's repeats (default ${DEFAULT_RUNS}).`

export interface CheckAccess {
  /** One access per model, in the order given. */
  accesses: ResolvedAccess[]
  runs: number
}

export function checkAccess(env: Readonly<Record<string, string | undefined>>): CheckAccess | { skip: string } {
  const provider = env.MODEL_CHECK_PROVIDER?.trim() as ModelProvider | undefined
  const models = (env.MODEL_CHECK_MODELS ?? '').split(',').map(m => m.trim()).filter(Boolean)
  const apiKey = env.MODEL_CHECK_API_KEY?.trim()
  const baseUrl = env.MODEL_CHECK_BASE_URL?.trim() || undefined
  if (!provider || !PROVIDERS.includes(provider) || models.length === 0 || !apiKey) return { skip: SKIP_LINE }
  if (provider === 'openai_compatible' && !baseUrl) return { skip: SKIP_LINE }
  const runs = Number(env.MODEL_CHECK_RUNS ?? DEFAULT_RUNS)
  if (!Number.isInteger(runs) || runs < 1) return { skip: `MODEL_CHECK_RUNS must be a whole number of 1 or more. ${SKIP_LINE}` }
  return {
    runs,
    accesses: models.map(model => ({
      providerId: `model-check-${provider}`, providerName: provider, provider, model, apiKey, ...(baseUrl ? { baseUrl } : {}),
    })),
  }
}

/** Whether a run asked for the check `id`: MODEL_CHECK_ONLY names the checks to run, comma-separated; unset, all run. */
export function checkAsked(env: Readonly<Record<string, string | undefined>>, id: string): boolean {
  const only = (env.MODEL_CHECK_ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return only.length === 0 || only.includes(id)
}
