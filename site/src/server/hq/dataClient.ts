import { prisma } from '#db'
import { readConnectionToken } from './connectionToken'
import { HQ_DATA_PATH, RUN_WAITING_APPROVAL_HEADER } from '@agenthix/core'

const REQUEST_TIMEOUT_MS = 15_000

export class HqDataError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'HqDataError'
  }
}

/**
 * Call an hq control-plane operation on behalf of a run (hq/site split spec §7.2); the MCP endpoint forwards to it.
 * `waitingForApproval`: the run has asked for something a person must approve, which hq is told so it holds the run's
 * own task where it is.
 */
export async function callHqData(
  operation: string,
  args: unknown,
  capabilityJwt: string,
  options: { waitingForApproval?: boolean } = {},
): Promise<unknown> {
  const [config, connection] = await Promise.all([
    prisma.siteConfig.findFirst(),
    prisma.hqConnection.findFirst(),
  ])
  const hqUrl = connection?.hqUrl ?? process.env.HQ_URL
  const token = readConnectionToken(connection?.connectionToken)
  if (!config?.siteId || !token || !hqUrl) {
    throw new HqDataError(0, 'Site is not registered with an hq')
  }

  // Joined as an absolute path — a base path in hqUrl would be dropped. Same
  // posture as registration (registrationService.ts); the ws channel differs
  // deliberately (see resolveChannelUrl.ts).
  let res: Response
  try {
    res = await fetch(new URL(HQ_DATA_PATH, hqUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Site-Id': config.siteId,
        'X-Run-Capability': capabilityJwt,
        ...(options.waitingForApproval ? { [RUN_WAITING_APPROVAL_HEADER]: '1' } : {}),
      },
      body: JSON.stringify({ operation, args }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError'
      ? `hq did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
      : 'hq is unreachable'
    throw new HqDataError(0, reason)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new HqDataError(res.status, body.error ?? `hq refused (${res.status})`)
  }

  let body: { result?: unknown }
  try {
    body = (await res.json()) as { result?: unknown }
  } catch {
    throw new HqDataError(0, 'hq returned a malformed response')
  }
  return body.result
}
