import { HttpError } from 'wasp/server'

/** What GitHub's public API says a login is, or null when GitHub can't be asked; it never blocks registering then. */
export type LoginKind = 'organisation' | 'person' | 'none' | null

export async function loginKind(login: string): Promise<LoginKind> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers: { Accept: 'application/vnd.github.v3+json' } })
    if (res.status === 404) return 'none'
    if (!res.ok) return null
    const body = (await res.json()) as { type?: unknown }
    return body.type === 'Organization' ? 'organisation' : 'person'
  } catch {
    return null
  }
}

/**
 * Refuses an organisation name GitHub doesn't know as an organisation, before the person leaves HQ. Whether they own
 * it only GitHub can tell, on its own page.
 */
export async function checkOrganisation(org: string, kind: (login: string) => Promise<LoginKind> = loginKind): Promise<void> {
  const found = await kind(org)
  if (found === 'none') {
    throw new HttpError(400, `GitHub has no organisation called "${org}". Check the spelling: it's the name in the organisation's address, github.com/${org}. Nothing was changed.`)
  }
  if (found === 'person') {
    throw new HttpError(400, `"${org}" is a person's GitHub account, not an organisation. Choose My personal account if it's yours, or type the organisation's name. Nothing was changed.`)
  }
}
