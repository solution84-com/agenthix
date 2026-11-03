/**
 * The organisation's trusted package scopes (live preview spec section 4, *The app*: install scripts are blocked by
 * default): npm scopes its admins mark trusted, for the organisation's own packages the public registry does not hold.
 * A package in one runs its install script in a live preview without the rule's checks. hq signs the list into each
 * live preview's claim (`runs.ts`); the site reads it from there.
 */
import { HttpError, prisma } from 'wasp/server'
import { MAX_TRUSTED_PACKAGE_SCOPES, isPackageScope, readPackageScopes } from '@agenthix/core'
import { requireRole } from '../server/identity/requireRole'
import { NOTHING } from './words'

type Ctx = { user?: { id: string } | null }

const plain = (s: string) => s.replace(/[^\x20-\x7e]/g, '').slice(0, 60)

/** The scopes as an admin typed them: each one a scope, no repeats, at most the limit; otherwise what to fix. */
export function readScopesInput(v: unknown): string[] {
  if (!Array.isArray(v) || !v.every(s => typeof s === 'string')) throw new HttpError(400, `Give the scopes as a list. ${NOTHING}`)
  const scopes = (v as string[]).map(s => s.trim()).filter(Boolean)
  const bad = scopes.find((s): boolean => !isPackageScope(s))
  if (bad !== undefined) {
    const why = bad.startsWith('@') ? 'a scope is @ and a lower-case name, with no slash, like @fernhill' : 'a scope starts with @, like @fernhill'
    throw new HttpError(400, `${plain(bad)} is not an npm scope: ${why}. ${NOTHING}`)
  }
  const unique = [...new Set(scopes)]
  if (unique.length > MAX_TRUSTED_PACKAGE_SCOPES) {
    throw new HttpError(400, `The organisation can trust at most ${MAX_TRUSTED_PACKAGE_SCOPES} scopes. ${NOTHING}`)
  }
  return unique
}

/** The scopes as stored, read again as they travel: a stored list that is not one trusts none. */
export async function orgTrustedPackageScopes(): Promise<string[]> {
  const org = await prisma.org.findFirst({ select: { trustedPackageScopes: true } })
  return readPackageScopes(org?.trustedPackageScopes ?? []) ?? []
}

export const getTrustedPackageScopes = async (_args: unknown, context: Ctx): Promise<{ scopes: string[] }> => {
  await requireRole(context, 'ADMIN', "Seeing the organisation's trusted package scopes")
  return { scopes: await orgTrustedPackageScopes() }
}

/** Takes effect at each live preview's next claim; one already given keeps what it was given until it renews. */
export const setTrustedPackageScopes = async (args: { scopes: string[] }, context: Ctx): Promise<{ scopes: string[] }> => {
  await requireRole(context, 'ADMIN', "Changing the organisation's trusted package scopes")
  const scopes = readScopesInput(args?.scopes)
  const { count } = await prisma.org.updateMany({ data: { trustedPackageScopes: scopes } })
  if (count === 0) throw new HttpError(409, `There is no organisation yet. Finish setting HQ up first. ${NOTHING}`)
  return { scopes }
}
