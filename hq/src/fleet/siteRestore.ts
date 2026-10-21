/**
 * A site restored from its backup onto a new machine renews its credential here, once, before it starts (adr-0119;
 * core's `SITE_RESTORE_RENEW_PATH`). Two proofs are needed, and hq holds neither secret:
 *
 * - the site's credential, which only its backup carries besides the site itself, so hq gains no power to move a site;
 * - the machine credential of a machine a fleet admin confirmed with a code for restoring that very site.
 *
 * It is accepted only while no machine is connected as the site, and while the machine the site ran on is not
 * connected either, so a stolen backup cannot push out a site that runs. From then on the backup's credential is
 * refused — the site's old machine with it, if it comes back — and the site is recorded on the new machine, named
 * after it as every site is after its machine (host-management spec §6), from hq's own record of that machine. Every
 * fleet admin and organisation admin is told. Pure: the store and the live connections are given.
 */
import { createHash } from 'node:crypto'

export type RestoreSiteRow = { id: string; siteId: string; label: string; credentialHash: string; relayHostId: string | null }
export type RestoreHostRow = { hostId: string; machineName: string }

export type CommitOutcome = { ok: true } | { ok: false; reason: 'changed' | 'inUse' } | { ok: false; reason: 'carries'; label: string }

export type SiteRestoreDeps = {
  /** A site a Fleet Console added, not revoked, by the credential it presents; never hq's default site. */
  siteByCredential(credential: string): Promise<RestoreSiteRow | null>
  /** A machine in the fleet, by its machine credential. */
  hostByCredential(credential: string): Promise<RestoreHostRow | null>
  /** The site a fleet admin confirmed this machine to restore, with a code for restoring; null when none. */
  restoreJoinOf(hostId: string): Promise<{ joinId: string; executionSiteId: string } | null>
  machineName(hostId: string): Promise<string | null>
  /**
   * In one transaction: the site still holds `expectedHash`, the new machine carries no other site, and the join is
   * spent. The site takes `label`, the new machine's name.
   */
  commit(p: { executionSiteId: string; expectedHash: string; newHash: string; hostId: string; joinId: string; label: string }): Promise<CommitOutcome>
  siteConnected(siteId: string): boolean
  hostOnline(hostId: string): boolean
  /** Closes any socket still open as the site: it authenticated with the credential just replaced. */
  closeSite(siteId: string): void
  /** `label`: the site's name before, on the machine it ran on; `machine`: the new machine's, which it takes. */
  announce(p: { label: string; machine: string }): Promise<void>
}

export type RenewalRequest = { siteCredential: string; machineCredential: string; body: unknown }
export type RenewalReply = { status: 200 | 400 | 401 | 409; body: Record<string, string> }

const HEX64 = /^[0-9a-f]{64}$/
const hash = (v: string) => createHash('sha256').update(v).digest('hex')

const refused = (error: string): RenewalReply => ({ status: 409, body: { error } })
const UNKNOWN = "HQ does not know the site's credential from this backup: the site was removed from HQ, or was restored elsewhere since this backup was taken."

export async function renewRestoredSite(req: RenewalRequest, deps: SiteRestoreDeps): Promise<RenewalReply> {
  if (!req.siteCredential || !req.machineCredential) return { status: 401, body: { error: 'unauthorized' } }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  const check = body.check === true
  const newHash = typeof body.credentialHash === 'string' ? body.credentialHash.toLowerCase() : ''
  if (!check && !HEX64.test(newHash)) return { status: 400, body: { error: 'Say the hash of the new credential.' } }

  const host = await deps.hostByCredential(req.machineCredential)
  if (!host) return { status: 401, body: { error: 'unauthorized' } }
  const site = await deps.siteByCredential(req.siteCredential)
  if (!site) return { status: 401, body: { error: UNKNOWN } }
  const answer: RenewalReply = { status: 200, body: { executionSiteId: site.id, siteName: site.label } }

  // Asked again after a lost answer, with the credential already renewed to: nothing changes.
  if (!check && hash(req.siteCredential) === newHash) {
    return site.relayHostId === host.hostId ? answer : refused('That is the credential the site has now; a renewal makes a new one.')
  }

  const join = await deps.restoreJoinOf(host.hostId)
  if (!join || join.executionSiteId !== site.id) {
    return refused(`Refused: ${host.machineName} was not connected to restore ${site.label}. A fleet admin chooses Restore from a backup… for ${site.label} in the Fleet Console, and this machine connects with that code.`)
  }
  if (deps.siteConnected(site.siteId)) {
    return refused(`Refused: ${site.label} is connected to HQ right now. A site that runs is not replaced from a backup; to give it a new machine, a fleet admin moves it with Move site….`)
  }
  const oldMachine = site.relayHostId && site.relayHostId !== host.hostId ? await deps.machineName(site.relayHostId) : null
  if (site.relayHostId && site.relayHostId !== host.hostId && deps.hostOnline(site.relayHostId)) {
    return refused(`Refused: ${oldMachine ?? `the machine ${site.label} runs on`} is connected to HQ right now, so it is not lost. To give it a new machine, a fleet admin moves it with Move site….`)
  }
  if (check) return answer

  const committed = await deps.commit({
    executionSiteId: site.id, expectedHash: site.credentialHash, newHash, hostId: host.hostId, joinId: join.joinId, label: host.machineName,
  })
  if (!committed.ok) {
    if (committed.reason === 'carries') return refused(`Refused: ${host.machineName} already carries the site ${committed.label}.`)
    if (committed.reason === 'inUse') return refused('Refused: that credential is already in use. Run the restore again.')
    return refused(`Refused: ${site.label} changed while it was being renewed, or this code was used already. Nothing was changed.`)
  }
  // A connection that slipped in with the old credential between the check and the commit goes now.
  deps.closeSite(site.siteId)
  await deps.announce({ label: site.label, machine: host.machineName })
  return { status: 200, body: { executionSiteId: site.id, siteName: host.machineName } }
}
