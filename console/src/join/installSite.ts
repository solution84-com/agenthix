/**
 * Step 5 of connecting a machine (spec §6): once the host service is online with its new machine credential, it is
 * asked — signed — to install its site, and answers with the hash of the credential it made for the site. Only that
 * hash goes to hq, with `site.register`; the credential itself never leaves the machine. The site is named after its
 * machine, on the machine and in hq alike: no name is sent.
 */
import { BRANDING, type HostActor } from '@agenthix/core'
import type { Activity } from '../activity'
import type { HqLink } from '../hq/link'
import type { HostCommands } from '../hosts/commands'
import type { Presence } from '../hosts/presence'
import type { PinnedHosts } from '../state/hosts'

const SHA256_HEX = /^[0-9a-f]{64}$/
const ONLINE_WAIT_MS = 5 * 60_000

export type InstallSiteDeps = { link: HqLink; hosts: PinnedHosts; commands: HostCommands; presence: Presence; activity: Activity }

export async function installSite(
  deps: InstallSiteDeps,
  { fingerprint, version, by }: { fingerprint: string; version: string; by: HostActor & { kind: 'fleetAdmin' } },
  onlineWaitMs = ONLINE_WAIT_MS,
): Promise<void> {
  const host = deps.hosts.byFingerprint(fingerprint)
  if (!host) throw new Error('The machine is no longer connected to this Fleet Console.')
  if (!(await deps.presence.waitOnline(fingerprint, onlineWaitMs))) {
    throw new Error(`${host.machineName} has not connected to HQ yet. Check \`${BRANDING.cliCommand} status\` on that machine, then try again.`)
  }
  const answer = await deps.commands.send(fingerprint, { op: 'install', target: 'site', version }, by)
  if (!answer.ok) throw new Error(answer.refusal.message)
  // The install's result for a site carries the hash of the credential the host service made (spec §6 step 5).
  const credentialHash = (answer.result as { credentialHash?: unknown }).credentialHash
  if (typeof credentialHash !== 'string' || !SHA256_HEX.test(credentialHash)) {
    throw new Error(`${host.machineName} installed its site but did not give the hash of its credential, so HQ cannot accept it.`)
  }
  const { executionSiteId } = await deps.link.call('site.register', { hostId: host.hostId, credentialHash })
  deps.hosts.update(fingerprint, { executionSiteId, siteName: host.machineName })
  await deps.activity.record(by.userId, 'site.registered', host.machineName, false)
}
