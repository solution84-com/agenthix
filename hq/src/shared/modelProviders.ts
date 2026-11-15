/**
 * An OpenAI-compatible endpoint's base URL as stored, or why it is refused. Only
 * http and https, and no user name or password in it: the URL is shown back on
 * the settings page, so a secret written into it would be shown too.
 */
export function checkBaseUrl(raw: string): { baseUrl: string } | { problem: string } {
  const value = raw.trim()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { problem: 'The base URL is not a valid address' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { problem: 'The base URL must start with http:// or https://' }
  if (url.username || url.password) return { problem: 'Put the key in the key field, not in the base URL' }
  return { baseUrl: value }
}
