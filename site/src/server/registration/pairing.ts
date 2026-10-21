import { pairedHqUrlProblem, type ResolveAll } from '../control/hqUrlPolicy'
import { storeHqLink } from './registrationService'
import { connectionTokenStoreProblem } from '../hq/connectionToken'
import { setPairingProblem } from '../hq/linkProblem'
import { channelUrlOf, pairedAddress } from '../hq/addressFollow'
import { Logger } from '../utils/logger'

const logger = new Logger('pairing')

/** Same floor hq applies to the shared secret — `openssl rand -hex 32` is 64. */
const MIN_SECRET_LENGTH = 32

// hq-web's container may still be starting when the site does (both restart with the machine), and its name
// resolves only once it runs: a name that does not resolve is asked again for about half a minute.
const RESOLVE_ATTEMPTS = 15
const RESOLVE_RETRY_MS = 2_000

export type PairingOptions = { resolve?: ResolveAll; sleep?: (ms: number) => Promise<void> }

async function addressProblem(hqUrl: string, { resolve, sleep }: PairingOptions): Promise<string | null> {
  const wait = sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  let problem = await pairedHqUrlProblem(hqUrl, resolve)
  for (let attempt = 1; problem && /does not resolve/.test(problem) && attempt < RESOLVE_ATTEMPTS; attempt++) {
    await wait(RESOLVE_RETRY_MS)
    problem = await pairedHqUrlProblem(hqUrl, resolve)
  }
  return problem
}

/** hq's own site: given hq's address and the pairing secret in its environment (adr-0070). */
export const pairedBySecret = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.HQ_URL?.trim() && env.HQ_PAIRING_SECRET?.trim())

/**
 * hq's own site is connected by configuration, not registration: the same
 * secret sits in hq's and this site's environment, and this site presents it as
 * its bearer credential exactly as a registered site presents its machine
 * credential. Stored, encrypted, on every boot, so a wiped site database — or
 * one holding a credential it can no longer read — is rebuilt from the
 * environment alone. The secret is never logged.
 */
export async function connectFromPairingSecretIfConfigured(options: PairingOptions = {}): Promise<'connected' | 'not-configured' | 'failed'> {
  setPairingProblem(null)
  const hqUrl = process.env.HQ_URL?.trim()
  const secret = process.env.HQ_PAIRING_SECRET?.trim()
  if (!hqUrl || !secret) return 'not-configured'

  if (secret.length < MIN_SECRET_LENGTH) {
    logger.error(`Not pairing with hq: HQ_PAIRING_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Generate one with \`openssl rand -hex 32\`.`)
    setPairingProblem('secretTooShort')
    return 'not-configured'
  }

  const problem = await addressProblem(hqUrl, options)
  if (problem) {
    logger.error(`Not pairing with hq from HQ_URL: ${problem}`)
    setPairingProblem('addressRefused')
    return 'not-configured'
  }

  const storeProblem = connectionTokenStoreProblem()
  if (storeProblem) {
    logger.error(`Not pairing with hq: ${storeProblem}`)
    setPairingProblem('credentialStore')
    return 'failed'
  }

  const base = hqUrl.replace(/\/+$/, '')
  // hq may have moved since HQ_URL was set, and this site followed it once the new address passed the move check.
  const { hqUrl: dial, keepMove } = await pairedAddress(base)
  await storeHqLink({
    orgId: null, // HqConnection.orgId is optional; nothing on this side reads it
    hqUrl: dial,
    hqWsUrl: channelUrlOf(dial),
    machineCredential: secret,
    pairedHqUrl: base,
    keepMove,
  })
  logger.info(dial === base ? `Paired with hq at ${base} by HQ_PAIRING_SECRET.` : `Paired with hq at ${dial}, where it moved from ${base}, by HQ_PAIRING_SECRET.`)
  return 'connected'
}
