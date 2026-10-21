/**
 * How full an OpenCode session's memory is, against the model's own
 * limits from OpenCode's provider list (`GET /config/providers`, each model's
 * `limit`), and where OpenCode summarises it on its own — computed as its
 * overflow check does in 1.18.32 (`session/overflow.ts`): the model's input
 * limit less a reserve of at most 20,000 tokens when it has one, else its
 * window less its largest reply (capped at 32,000). Re-checked at every upgrade.
 */
import type { ContextUse } from '@agenthix/core'
import type { OpenCodeServers } from './openCodeServers'
import type { OpenCodeModel } from './openCodeConfig'

export type ModelLimit = { context: number; input?: number; output: number }

const COMPACTION_BUFFER = 20_000
const OUTPUT_TOKEN_MAX = 32_000
const LIMIT_READ_TIMEOUT_MS = 5_000

/** A model's limits, read once per container and model: they are OpenCode's model list, which a turn does not change. */
const limits = new Map<string, ModelLimit | null>()

export function modelLimitIn(body: string, model: OpenCodeModel): ModelLimit | null {
  try {
    const parsed = JSON.parse(body) as { providers?: Array<{ id?: string; models?: Record<string, { limit?: Partial<ModelLimit> }> }> }
    const limit = parsed.providers?.find(p => p.id === model.providerID)?.models?.[model.modelID]?.limit
    if (!limit || typeof limit.context !== 'number' || limit.context <= 0) return null
    return { context: limit.context, output: typeof limit.output === 'number' ? limit.output : 0, ...(typeof limit.input === 'number' ? { input: limit.input } : {}) }
  } catch {
    return null
  }
}

export async function modelLimit(servers: OpenCodeServers, containerName: string, model: OpenCodeModel, where: string): Promise<ModelLimit | null> {
  const key = `${containerName}|${model.providerID}/${model.modelID}`
  if (limits.has(key)) return limits.get(key) ?? null
  const res = await servers.request(containerName, 'GET', `/config/providers?${where}`, undefined, LIMIT_READ_TIMEOUT_MS).catch(() => null)
  if (!res || res.status !== 200) return null
  const limit = modelLimitIn(res.body, model)
  limits.set(key, limit)
  return limit
}

export function openCodeContextUse(tokens: number, limit: ModelLimit, at: Date): ContextUse {
  const maxOutput = Math.min(limit.output, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX
  const summarisesAt = limit.input
    ? Math.max(0, limit.input - Math.min(COMPACTION_BUFFER, maxOutput))
    : Math.max(0, limit.context - maxOutput)
  return { tokens, summarisesAt, window: limit.context, at: at.toISOString() }
}
