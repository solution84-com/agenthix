/**
 * The old machine's copy of a site a restore replaced (adr-0119; `siteRestore.ts`): its credential is refused like any
 * other, and this tells the site why, so it stops trying and its machine can say so.
 */
import { prisma } from 'wasp/server'
import { credentialMatches } from '../sites/credentials'

/**
 * When the site with this id was replaced by a restore onto another machine, if `credential` is the very one the
 * restore replaced; null otherwise. Asked only after the credential was refused, so only the old machine's copy of
 * the site — which holds that credential — learns it was replaced, and no caller learns anything of another site.
 */
export async function replacedSiteAt(siteId: string, credential: string): Promise<Date | null> {
  const row = await prisma.executionSite.findUnique({
    where: { siteId },
    select: { isDefault: true, status: true, replacedCredentialHash: true, replacedAt: true },
  })
  if (!row || row.isDefault || row.status === 'REVOKED' || !row.replacedAt) return null
  return credentialMatches(credential, row.replacedCredentialHash) ? row.replacedAt : null
}
