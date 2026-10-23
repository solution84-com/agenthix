/**
 * hq's Agenthix Cloud access token, as the relay holds it for containers' calls through Cloud's gateway: asked of hq
 * (`requestCloudAiToken`), kept in memory only, and asked for again a minute before it lapses
 * (`CLOUD_AI_TOKEN_REFRESH_BEFORE_MS`). Calls arriving together share one request. A refusal is remembered briefly,
 * so a burst of calls while Cloud is not available asks hq once.
 */
import { CLOUD_AI_TOKEN_REFRESH_BEFORE_MS } from '@agenthix/core'
import { requestCloudAiToken, type CloudTokenAnswer } from './usageReportClient'

const REFUSAL_KEPT_MS = 30_000

export type CloudTokenDeps = { request: () => Promise<CloudTokenAnswer>; now: () => number }

export function createCloudTokenSource(deps: CloudTokenDeps = { request: requestCloudAiToken, now: Date.now }) {
  let held: { token: string; expiresAt: number } | null = null
  let refused: { answer: Extract<CloudTokenAnswer, { ok: false }>; until: number } | null = null
  let asking: Promise<CloudTokenAnswer> | null = null

  return async function cloudToken(): Promise<CloudTokenAnswer> {
    const now = deps.now()
    if (held && now < held.expiresAt - CLOUD_AI_TOKEN_REFRESH_BEFORE_MS) return { ok: true, token: held }
    if (refused && now < refused.until) return refused.answer
    asking ??= deps.request().then(answer => {
      if (answer.ok) {
        held = answer.token
        refused = null
      } else {
        held = null
        refused = { answer, until: deps.now() + REFUSAL_KEPT_MS }
      }
      return answer
    }).finally(() => { asking = null })
    return asking
  }
}

export const cloudToken = createCloudTokenSource()
