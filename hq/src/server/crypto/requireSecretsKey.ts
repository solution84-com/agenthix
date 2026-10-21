import { HttpError } from 'wasp/server'
import { masterKeyProblem } from './secretCrypto'

/**
 * Refuses, with text the person can act on, when SECRETS_MASTER_KEY cannot encrypt.
 * Called before anything that spends something once (a sign-in code, a GitHub
 * registration code) or takes a value that would otherwise fail on save.
 */
export function requireSecretsKey(what: string): void {
  const problem = masterKeyProblem()
  if (problem) {
    throw new HttpError(
      503,
      `${what} needs hq to be able to store secrets. ${problem} An administrator must set it in hq's environment (openssl rand -base64 32) and restart hq.`,
    )
  }
}
