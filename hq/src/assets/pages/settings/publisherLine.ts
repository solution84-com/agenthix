/** One trusted publisher in words (board R2): what its signature proves, and whether it is trusted now. Pure. */
export type PublisherLineInput = {
  kind: 'built-in' | 'keyless' | 'key'
  status: 'trusted' | 'remembered'
  repository: string | null
  identity: string | null
  refs: string | null
  keyId: string | null
  addedAt: string | null
  /** How many assets it signed are in the Library now. */
  installed?: number
}

const bare = (address: string) => address.replace(/^https:\/\//, '')

const count = (p: PublisherLineInput) => (p.installed === undefined ? null : `${p.installed} installed`)

export function publisherLine(p: PublisherLineInput): string {
  if (p.kind === 'built-in') return ["Always trusted. Signs Agenthix's own skills and templates; they come with HQ itself.", count(p)].filter(Boolean).join(' · ')
  const proves = p.kind === 'key'
    ? `key ${p.keyId ?? ''}`.trim()
    : p.repository
      ? `${bare(p.repository)} · workflow ${p.identity ?? ''}${p.refs ? ` (${p.refs})` : ''} (keyless)`
      : `${p.identity ?? ''} (keyless)`
  const state = p.status === 'remembered' ? 'Not trusted now. Installed once, or removed.' : p.addedAt ? `Added ${new Date(p.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.` : ''
  return [proves, state, count(p)].filter(Boolean).join(' · ')
}
