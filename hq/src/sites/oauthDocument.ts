/**
 * Whether a subscription document a site or a sign-in hands back may be stored: it parses as an object carrying a
 * `claudeAiOauth.expiresAt` that AGREES with the expiry declared beside it — not merely that one exists — so a frame
 * can't declare one freshness value while smuggling in a document whose own claimed expiry disagrees with it. A
 * refused document never reaches `encryptSecret` or the store.
 */
export function isPlausibleOauthDocument(oauthJson: string, declaredExpiresAt: number): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(oauthJson)
  } catch {
    return false
  }
  if (!parsed || typeof parsed !== 'object') return false
  const claudeAiOauth = (parsed as Record<string, unknown>).claudeAiOauth
  if (!claudeAiOauth || typeof claudeAiOauth !== 'object') return false
  const expiresAt = (claudeAiOauth as Record<string, unknown>).expiresAt
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt === declaredExpiresAt
}
