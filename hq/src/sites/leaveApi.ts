import type { SiteLeaveApi } from 'wasp/server/api'
import { prisma } from 'wasp/server'
import { authenticateSite } from './registrationService'
import { credentialMatches, hashCredential } from './credentials'
import { revokeSite } from './revokeSite'
import { defaultSiteRefusal } from './defaultSiteRefusal'
import { reconcileMachineNotices } from './machineNotices'

/**
 * A site that presents no id is known by its credential alone, and nothing about it changes: the host service of a
 * machine that disconnected itself holds its site's credential but not the id the site gave itself
 * (host-management spec §6).
 */
async function siteByCredential(credential: string) {
  const row = await prisma.executionSite.findFirst({ where: { credentialHash: hashCredential(credential) } })
  return row && row.status !== 'REVOKED' && credentialMatches(credential, row.credentialHash) ? row : null
}

/**
 * A site leaving its hq (ADR-0065): the installer chose to join, so the machine
 * can always leave. Authenticated by the site's own credential, sent by the site
 * itself or by its machine's host service; the effect is the same as an admin
 * revoking it.
 */
export const siteLeaveHandler: SiteLeaveApi = async (req, res) => {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
  const siteIdHeader = req.headers['x-site-id']
  const siteId = typeof siteIdHeader === 'string' ? siteIdHeader : ''
  const site = !token ? null : siteId ? await authenticateSite(siteId, token) : await siteByCredential(token)
  if (!site) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (site.isDefault) {
    res.status(409).json({ error: defaultSiteRefusal('left') })
    return
  }
  await revokeSite(site.siteId, { leftByItself: true })
  // Fleet admins are asked to remove the machine it ran on.
  void reconcileMachineNotices()
  res.status(200).json({ ok: true })
}
