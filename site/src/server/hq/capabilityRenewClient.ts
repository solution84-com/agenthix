import { prisma } from '#db'
import { readConnectionToken } from './connectionToken'
import { HQ_CAPABILITY_RENEW_PATH, type CapabilityRenewRequest, type CapabilityRenewResult } from '@agenthix/core'

/**
 * §2a renewal, site's half: presents the current, still-valid capability to
 * hq's HQ_CAPABILITY_RENEW_PATH and receives a fresh one, claims re-resolved
 * from hq's live data. Same resolve-hqUrl-from-HqConnection pattern as this
 * file's sibling dataClient.ts's `callHqData`; the capability itself (not the
 * machine credential) is what proves this call is for a specific live run.
 *
 * Extracted out of AgentEngine.ts (plan 5d-2 task 7b review) so the transport
 * call sits beside its sibling (dataClient.ts) rather than inside the engine —
 * the engine's own remaining size is Task 13 scope, not further split here.
 * Passed into `capabilityRenewal.ts`'s transport-agnostic `startCapabilityRenewal`
 * as its `renew` callback by AgentEngine.ts, the sole caller.
 */
export async function renewCapabilityViaHq(currentJwt: string): Promise<CapabilityRenewResult> {
  const [config, connection] = await Promise.all([
    prisma.siteConfig.findFirst(),
    prisma.hqConnection.findFirst(),
  ])
  const hqUrl = connection?.hqUrl ?? process.env.HQ_URL
  const token = readConnectionToken(connection?.connectionToken)
  if (!config?.siteId || !token || !hqUrl) {
    throw new Error('Site is not registered with an hq — cannot renew capability')
  }

  const res = await fetch(new URL(HQ_CAPABILITY_RENEW_PATH, hqUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Site-Id': config.siteId,
    },
    body: JSON.stringify({ capability: currentJwt } satisfies CapabilityRenewRequest),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `hq refused to renew the capability (${res.status})`)
  }

  const body = (await res.json()) as CapabilityRenewResult
  return { capability: body.capability, expiresAt: body.expiresAt }
}
