import { decryptSecret, encryptSecret, looksEncrypted, masterKeyProblem } from '../crypto/secretCrypto'
import { Logger } from '../utils/logger'

const logger = new Logger('hq')

/**
 * The one door onto HqConnection.connectionToken, the site's credential to hq.
 * It is stored encrypted; everything that presents it to hq reads it through
 * readConnectionToken.
 *
 * A stored value this site cannot decrypt — one written before encryption, or
 * under a different SECRETS_MASTER_KEY — reads as no credential at all: it is
 * never converted, and never sent. The default site recovers on its own at the
 * next start from HQ_PAIRING_SECRET; any other site is added again in the Fleet Console.
 */

let warned = false

function warnOnce(reason: string): void {
  if (warned) return
  warned = true
  logger.warn(`Stored hq credential ignored: ${reason}. Treating this site as not connected — the default site re-pairs from HQ_PAIRING_SECRET at its next start; any other site is added again in the Fleet Console.`)
}

/** Why a credential cannot be stored now, or null when it can. */
export function connectionTokenStoreProblem(): string | null {
  const problem = masterKeyProblem()
  return problem ? `This site cannot store its hq credential. ${problem} Set it in the site's environment (openssl rand -base64 32) and restart the site.` : null
}

export function sealConnectionToken(raw: string): string {
  const problem = connectionTokenStoreProblem()
  if (problem) throw new Error(problem)
  return encryptSecret(raw)
}

export function readConnectionToken(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!looksEncrypted(stored)) {
    warnOnce('it was stored in the clear, before credentials were encrypted')
    return null
  }
  try {
    return decryptSecret(stored)
  } catch (err) {
    warnOnce(`it could not be decrypted (${err instanceof Error ? err.message : String(err)})`)
    return null
  }
}

/** test-only */
export function _resetConnectionTokenWarning(): void {
  warned = false
}
