/**
 * Why a site is not connected to hq, as a closed set of causes rather than text, so that the site, the host
 * service and hq can each word it themselves (host-management spec §10). Browser-safe: no Node import.
 *
 * - secretTooShort: HQ_PAIRING_SECRET is shorter than hq accepts, so the site did not pair.
 * - addressRefused: the site would not send its credential to HQ_URL (plain http outside a private network).
 * - credentialStore: the site cannot keep a credential (SECRETS_MASTER_KEY is missing or wrong).
 * - credentialRefused: hq answered, and does not accept this site's credential.
 * - versionMismatch: hq answered, and runs a protocol this site does not.
 * - unreachable: hq did not answer at all.
 */
export const SITE_CAUSES = [
  'secretTooShort', 'addressRefused', 'credentialStore', 'credentialRefused', 'versionMismatch', 'unreachable',
] as const
export type SiteCause = typeof SITE_CAUSES[number]

/** The cause in a value from outside, or null when it is not one of the set. */
export function parseSiteCause(raw: unknown): SiteCause | null {
  return SITE_CAUSES.find(c => c === raw) ?? null
}
