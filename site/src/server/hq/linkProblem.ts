import type { SiteCause } from '@agenthix/core'

/**
 * Why this site is not connected to hq: the closed set of causes lives in `@agenthix/core`, so that the site, the
 * host service and hq read one list (host-management spec §10).
 */
export type HqLinkProblem = SiteCause

type PairingProblem = Extract<HqLinkProblem, 'secretTooShort' | 'addressRefused' | 'credentialStore'>

let pairingProblem: PairingProblem | null = null

/** Set by pairing at boot: why the site did not pair from its environment, or null when it did (or was not asked to). */
export function setPairingProblem(problem: PairingProblem | null): void {
  pairingProblem = problem
}

export function currentPairingProblem(): PairingProblem | null {
  return pairingProblem
}
