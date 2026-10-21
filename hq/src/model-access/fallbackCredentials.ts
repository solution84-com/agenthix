/**
 * The credentials for a turn's other providers (spec §6, "Every provider the
 * turn may use has its credential"). A turn may switch to a fallback model,
 * and a fallback may belong to another provider than the turn's own model;
 * the site's model relay picks each request's key by provider, so the
 * dispatch carries one credential per provider the turn may use.
 *
 * Each is resolved by the same rules as the turn's own (modelCredential.ts):
 * the project's, then the run's person's, then the org's. Only API keys ride here — a subscription is
 * Anthropic's alone, used only by the Claude runtime, whose fallbacks are all
 * Anthropic's and so never another provider. A provider with nothing
 * configured is left out, and the relay refuses its requests; it does not
 * fail the turn, which may never need it.
 */
import type { ApiKeyRunCredential } from '@agenthix/core'
import type { OverrideBoundary } from '../agents/overrides/agentOverrideService'
import { providerOfModel, resolveRunCredential, type RunPerson } from './modelCredential'

export async function resolveFallbackCredentials(
  boundary: OverrideBoundary | null,
  person: RunPerson | null,
  runtime: string,
  model: string,
  fallbackModels: readonly string[],
): Promise<ApiKeyRunCredential[]> {
  if (fallbackModels.length === 0) return []
  const own = providerOfModel(runtime, model)
  const seen = new Set(own ? [own] : [])
  const credentials: ApiKeyRunCredential[] = []
  for (const fallback of fallbackModels) {
    const provider = providerOfModel(runtime, fallback)
    if (!provider || seen.has(provider)) continue
    seen.add(provider)
    const { credential } = await resolveRunCredential(boundary, person, runtime, fallback)
    if (credential?.kind === 'apiKey') credentials.push(credential)
  }
  return credentials
}
