import { useEffect, useState } from 'react'

/** What a way-in page may show of the organisation: every field is null when the admin's choice leaves it out. */
export type ShownIdentity = {
  name: string | null
  handle: string | null
  vision: string | null
  avatarUrl: string | null
  coverUrl: string | null
  /** Only the public read carries the admin's choice; a name-only choice drops the banner and the picture. */
  shows?: 'cover' | 'name' | 'nothing'
}

export type PublicIdentity = ShownIdentity & { shows: 'cover' | 'name' | 'nothing' }

/** The hero an identity makes: none when the admin chose to show nothing, else the cover with whatever else was chosen. */
export function heroOf(identity: ShownIdentity | null): ShownIdentity | null {
  return identity && identity.name ? identity : null
}

/** "Acme Corp's HQ", or just "HQ" while the name is not shown. */
export function hqOf(name: string | null): string {
  return name ? `${name}'s HQ` : 'HQ'
}

export const initialOf = (name: string | null): string => (name ?? '').trim().charAt(0).toUpperCase() || '?'

/** The organisation before anyone has signed in (`GET /api/org/public-identity`); null while it loads or if it cannot be read. */
export function usePublicIdentity(): { identity: PublicIdentity | null; loaded: boolean } {
  const [identity, setIdentity] = useState<PublicIdentity | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let live = true
    fetch('/api/org/public-identity')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (live) setIdentity(data as PublicIdentity | null) })
      .catch(() => {})
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [])
  return { identity, loaded }
}
