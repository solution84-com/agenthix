/**
 * A lost site restored onto a new machine (adr-0119), once a fleet admin confirmed that machine's fingerprint with a
 * code for restoring it: the Fleet Console asks the new machine, signed, to restore the backup its machine admin chose
 * there (`backup.restore` from `joined`) — the key never leaves that machine — and the host service renews the
 * site's credential at HQ before it starts it. The site then lives on the new machine; the machine it ran on is
 * replaced, and leaves the fleet, as a move's old machine does. HQ refuses its site already, and now the machine too.
 * Like every site, it is named after the machine it runs on: it takes the new machine's name, here and in HQ.
 */
import { BRANDING } from '@agenthix/core'
import type { Activity } from '../activity'
import type { HqLink } from '../hq/link'
import type { HostCommands } from '../hosts/commands'
import type { Presence } from '../hosts/presence'
import type { PinnedHost, PinnedHosts } from '../state/hosts'
import type { FleetAdmin } from './joins'
import { nowRunsOn } from './names'

const ONLINE_WAIT_MS = 5 * 60_000

export type RestoreSiteDeps = { link: HqLink; hosts: PinnedHosts; commands: HostCommands; presence: Presence; activity: Activity }

export async function restoreSite(
  deps: RestoreSiteDeps,
  { fingerprint, lost, executionSiteId, by }: { fingerprint: string; lost: PinnedHost; executionSiteId: string; by: FleetAdmin },
  onlineWaitMs = ONLINE_WAIT_MS,
): Promise<{ warning: string | null }> {
  const host = deps.hosts.byFingerprint(fingerprint)
  if (!host) throw new Error('The machine is no longer connected to this Fleet Console.')
  if (!(await deps.presence.waitOnline(fingerprint, onlineWaitMs))) {
    throw new Error(`${host.machineName} has not connected to HQ yet. Check \`${BRANDING.cliCommand} status\` on that machine, then try again.`)
  }
  const answer = await deps.commands.send(fingerprint, { op: 'backup.restore', target: 'site', source: { from: 'joined' } }, by)
  if (!answer.ok) throw new Error(answer.refusal.message)
  const result = answer.result as { executionSiteId?: unknown }
  if (result.executionSiteId !== executionSiteId) {
    throw new Error(`${host.machineName} restored a site other than ${lost.siteName}. Look at the fleet before anything else.`)
  }
  deps.hosts.update(fingerprint, { executionSiteId, siteName: host.machineName })
  const said = nowRunsOn(lost.siteName, host.machineName)

  const old = deps.hosts.byFingerprint(lost.fingerprint)
  if (old && old.executionSiteId === executionSiteId) {
    // Its site's credential no longer works at HQ; the machine's own goes too, so a machine that comes back is refused.
    deps.hosts.update(old.fingerprint, { executionSiteId: null })
    try {
      await deps.link.call('host.disconnect', { hostId: old.hostId })
    } catch {
      // Still listed, with no site, so a fleet admin can disconnect it once HQ answers.
      await deps.activity.command(by.userId, 'backup.restore', said)
      return { warning: `${said}. HQ did not answer when the machine it ran on was to leave the fleet: disconnect that machine from the fleet.` }
    }
    deps.hosts.remove(old.fingerprint)
    deps.hosts.disconnected.add({
      fingerprint: old.fingerprint, machineName: old.machineName, siteName: old.siteName, by: { userId: by.userId, name: by.name },
      replacedBy: { machineName: host.machineName },
    })
  }
  await deps.activity.command(by.userId, 'backup.restore', said)
  return { warning: null }
}
