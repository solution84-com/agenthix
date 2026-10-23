/**
 * The site's calls to hq for the model relay, over HTTPS with the site's machine credential, as a capability renewal
 * is (capabilityRenewClient.ts): hq answers no requests on the control channel.
 *
 * - `sendUsageReports`: a batch of usage reports (`HQ_USAGE_REPORT_PATH`); hq answers the call ids it kept.
 * - `requestCloudAiToken`: hq's Agenthix Cloud access token for a container's calls through Cloud's gateway
 *   (`HQ_CLOUD_AI_TOKEN_PATH`); hq's private key never leaves hq.
 */
import { prisma } from '#db'
import {
  HQ_CLOUD_AI_TOKEN_PATH, HQ_USAGE_REPORT_PATH,
  type CloudAiTokenForSite, type CloudAiTokenRefusal, type UsageReport, type UsageReportAcknowledged, type UsageReportBatch,
} from '@agenthix/core'
import { readConnectionToken } from '../hq/connectionToken'

const TIMEOUT_MS = 15_000

async function postToHq(pathname: string, body: unknown): Promise<Response> {
  const [config, connection] = await Promise.all([prisma.siteConfig.findFirst(), prisma.hqConnection.findFirst()])
  const hqUrl = connection?.hqUrl ?? process.env.HQ_URL
  const token = readConnectionToken(connection?.connectionToken)
  if (!config?.siteId || !token || !hqUrl) throw new Error('The site is not registered with an HQ')
  return fetch(new URL(pathname, hqUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Site-Id': config.siteId },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

export async function sendUsageReports(reports: UsageReport[]): Promise<string[]> {
  const res = await postToHq(HQ_USAGE_REPORT_PATH, { reports } satisfies UsageReportBatch)
  if (!res.ok) throw new Error(`HQ answered ${res.status}`)
  const body = (await res.json()) as Partial<UsageReportAcknowledged>
  return Array.isArray(body.acknowledged) ? body.acknowledged.filter((id): id is string => typeof id === 'string') : []
}

export type CloudTokenAnswer = { ok: true; token: CloudAiTokenForSite } | { ok: false; refusal: CloudAiTokenRefusal['error'] | 'unreachable' }

export async function requestCloudAiToken(): Promise<CloudTokenAnswer> {
  let res: Response
  try {
    res = await postToHq(HQ_CLOUD_AI_TOKEN_PATH, {})
  } catch {
    return { ok: false, refusal: 'unreachable' }
  }
  const body = (await res.json().catch(() => ({}))) as Partial<CloudAiTokenForSite & CloudAiTokenRefusal>
  if (res.ok && typeof body.token === 'string' && body.token && typeof body.expiresAt === 'number') {
    return { ok: true, token: { token: body.token, expiresAt: body.expiresAt } }
  }
  const refusal = body.error === 'not_connected' || body.error === 'not_available' || body.error === 'disconnected' ? body.error : 'unreachable'
  return { ok: false, refusal }
}
