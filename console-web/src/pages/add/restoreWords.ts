/**
 * Restoring a lost site onto a new machine (adr-0119), in words: which sites can be, the warning before it (the
 * owner's: the machine may only be down for a while; restoring replaces it, and it is refused when it comes back; what
 * the site did since the backup is lost), what the machine admin runs, and how the restore goes.
 */
import { BRANDING } from '@agenthix/core'
import type { FleetHost } from '../dashboard/types'
import { spanOf, whenIs } from '../dashboard/words'
import type { JoinStep, JoinView } from './joinWords'

/** Heard from within this long, a machine is more likely restarting or cut off than lost: the warning says so. */
export const RECENTLY_MS = 24 * 60 * 60_000

export type Candidate = { host: FleetHost; restorable: boolean; why: string | null }

/** Every site but HQ's: restorable only while its machine is offline and nothing else is under way for it. */
export function candidates(hosts: FleetHost[]): Candidate[] {
  return hosts.filter(h => !h.hqMachine && h.siteRegistered).map(host => {
    if (host.online) return { host, restorable: false, why: `${host.machineName} is online, so ${host.siteName} is not lost. To give it a new machine, use Plan maintenance… on its page, and choose Move.` }
    if (host.move) return { host, restorable: false, why: `${host.siteName} is moving. Wait for the move to end.` }
    return { host, restorable: true, why: null }
  })
}

export function lastHeard(since: string | null, now: Date): string {
  return since ? `Last heard from ${whenIs(since, now)}, ${spanOf(since, now)} ago.` : 'Not heard from since the Fleet Console started.'
}

export type RestoreWarning = { strong: boolean; title: string; paragraphs: string[] }

/**
 * Before the code is made. `since`: when the lost machine was last heard from. `notify`: whether its fleet admins asked
 * to be told when it stops answering; a machine that is not is more often only switched off or asleep.
 */
export function restoreWarning(siteName: string, machineName: string, since: string | null, now: Date, notify = true): RestoreWarning {
  const recent = since !== null && now.getTime() - Date.parse(since) < RECENTLY_MS
  const paragraphs = [
    ...(notify ? [] : [`${machineName} is set not to notify the fleet admins when it stops answering: it may only be switched off or asleep.`]),
    `${machineName} may only be down for a while. Restoring ${siteName} onto a new machine replaces it: if ${machineName} comes back, HQ refuses it, and it leaves the fleet.`,
    `Anything ${siteName} did after its backup was taken is lost. The backup is chosen on the new machine; you see when it was taken before you confirm.`,
  ]
  if (recent) {
    paragraphs.unshift(`${machineName} was heard from ${spanOf(since!, now)} ago. A machine that went quiet so recently is more often restarting, or cut off from the network, than lost. Ask whoever looks after it before you go on.`)
  }
  const title = recent ? `${machineName} was heard from recently` : notify ? `Before you restore ${siteName}` : `${machineName} may only be switched off or asleep`
  return { strong: recent || !notify, title, paragraphs }
}

/** Shown beside the machine that used the code, before the fleet admin confirms it. */
export function confirmWarning(view: JoinView, now: Date): string[] {
  const r = view.restore
  if (!r) return []
  const taken = r.backupTakenAt ? whenIs(r.backupTakenAt, now) : 'an unknown time'
  const lines = [`It restores ${r.siteName} from its backup taken ${taken}. Anything ${r.siteName} did after that is lost.`]
  if (r.lostMachine) {
    lines.push(`${r.lostMachine}${r.lastHeardAt ? `, last heard from ${whenIs(r.lastHeardAt, now)},` : ''} is replaced: HQ refuses it if it comes back.`)
  }
  return lines
}

/** What the machine admin runs on the new machine: the backup and its key stay there. */
export function restoreCommand(hqAddress: string | null, code: string): string {
  return `${BRANDING.cliCommand} restore --from <folder or file> ${hqAddress ?? '<hq address>'} ${code}`
}

const STEPS = (site: string, machine: string, lost: string | null) => [
  'Machine confirmed, identities pinned',
  `${site} restored on ${machine} from its backup and named ${machine}, its credential renewed at HQ`,
  lost ? `${lost} replaced: it leaves the fleet` : 'The machine it ran on replaced',
]

export function restoreSteps(view: JoinView): JoinStep[] {
  const site = view.restore?.siteName || view.siteName || 'The site'
  const labels = STEPS(site, view.machine?.name ?? 'the new machine', view.restore?.lostMachine ?? null)
  // A failed restore whose machine was accepted failed at the restore itself.
  const failedAt = view.state === 'failed' ? (view.machine ? 1 : 0) : null
  const done = view.state === 'done' ? 3 : view.state === 'restoring' ? 1 : failedAt ?? 0
  return labels.map((label, i) => ({
    label, state: i < done ? 'done' : i === failedAt ? 'failed' : failedAt === null && i === done ? 'current' : 'todo',
  }))
}
