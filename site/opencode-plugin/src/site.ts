/**
 * The plugin's two calls to the site (`@agenthix/core`'s harness wire): the
 * OpenCode session's current turn, and a decision on one tool call. Each has
 * the plugin's own deadline, and neither ever throws: anything that goes
 * wrong reads as no turn, or as a refusal.
 */
import {
  HARNESS_GATE_PATH,
  HARNESS_GATE_UNAVAILABLE,
  HARNESS_SERVER_KEY_ENV,
  HARNESS_TURN_PATH,
  parseHarnessGateResponse,
  parseHarnessTurnResponse,
  type HarnessGateRequest,
  type HarnessGateResponse,
  type HarnessTurn,
  type OpenCodePluginConfig,
} from '@agenthix/core'

export type SiteClient = {
  turn(sessionId: string): Promise<HarnessTurn | null>
  decide(token: string, request: HarnessGateRequest): Promise<HarnessGateResponse>
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

async function postJson(fetchFn: Fetch, url: string, bearer: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`site answered ${res.status}`)
  return res.json()
}

export function siteClient(
  config: OpenCodePluginConfig,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: Fetch = fetch,
): SiteClient {
  return {
    async turn(sessionId) {
      const key = env[HARNESS_SERVER_KEY_ENV]
      if (!key) return null
      try {
        const body = await postJson(fetchFn, config.siteUrl + HARNESS_TURN_PATH, key, { sessionId }, config.turnTimeoutMs)
        return parseHarnessTurnResponse(body).turn
      } catch {
        return null
      }
    },
    async decide(token, request) {
      try {
        const body = await postJson(fetchFn, config.siteUrl + HARNESS_GATE_PATH, token, request, config.gateTimeoutMs)
        return parseHarnessGateResponse(body)
      } catch {
        return { decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE }
      }
    },
  }
}
