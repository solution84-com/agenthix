/**
 * What the CLI says around the Fleet Console (the CLI board's *The Fleet Console from the command line*, *agenthix
 * status*): connecting a machine, leaving, running the Fleet Console elsewhere, and the two HQ commands for it.
 */
import { movingLines } from './hqAddressWords'
import type { ManagementStatus } from '../link/status'
import type { ConnectResult, DisconnectResult } from '../link/manage'
import type { ConsoleCodeResult } from '../owner/consoleOps'
import type { ConsoleInstallResult } from '../install/console'
import { consoleAddress, DEFAULT_CONSOLE_ADDRESS } from '../compose/console'
import { cmd, nextStep, product, wrap } from './words'
import { consoleNotInLines } from './consoleRemoveWords'

const IN = '  '

/** Shown while the fleet admin compares, before they confirm. */
export function joinWaiting(machine: string, fingerprint: string): string {
  return [
    wrap('The fleet admin who made this code now sees this machine in the Fleet Console. Before they confirm, compare these with them — read them out on a call or in a message:'),
    `  Machine       ${machine}`,
    `  Fingerprint   ${fingerprint}`,
    wrap('If what they see is different, they must not confirm: press Ctrl-C.'),
    'Waiting for a fleet admin to confirm …',
  ].join('\n')
}

export function joined(machine: string, consoleFingerprint: string, hqAddress: string): string {
  return [
    wrap(`Confirmed. ${machine} is managed by the Fleet Console.`),
    wrap(`It keeps one connection out to ${hqAddress} and accepts none.`),
    `The Fleet Console's fingerprint, pinned: ${consoleFingerprint}`,
  ].join('\n')
}

/** A move armed here that ended before it came: it did not happen, why, and that the machine is free for another. */
export function moveDidNotHappen(kind: 'hq' | 'site', siteName: string, from: string, reason: string): string {
  const what = kind === 'hq' ? `HQ and its site ${siteName} did` : `The site ${siteName} did`
  const why = reason.charAt(0).toUpperCase() + reason.slice(1)
  return wrap(`${what} not move here from ${from}. ${/[.!?]$/.test(why) ? why : `${why}.`} Nothing of it is on this machine, and it is ready for another move.`)
}

export function connected(r: ConnectResult): string {
  const move = r.incoming
  if (move?.ended) return moveDidNotHappen(move.kind, move.siteName, move.from, move.ended)
  if (move?.kind === 'hq') {
    return nextStep(`Taking part. HQ and its site ${move.siteName} are moving here from ${move.from}. It takes a few minutes and runs by itself; to see how it stands:`, cmd('status'))
  }
  if (move && r.siteName) {
    return wrap(`Taking part. The site ${r.siteName} moved here from ${move.from} and has started, with its data and the credential it had.`)
  }
  if (move) return nextStep(`The site ${move.siteName} is moving here from ${move.from}. It carries on by itself; to see how it stands:`, cmd('status'))
  if (r.siteName) {
    return wrap(`Taking part. The site ${r.siteName} has started with its own credential, which the Fleet Console registers with HQ. No one in HQ needs to approve it.`)
  }
  return nextStep('The Fleet Console has not started the site here yet. It does so by itself; to see when:', cmd('status'))
}

export function disconnectWarning(machine: string, siteName: string | null): string {
  const lines = [wrap(`${machine} will no longer be managed by its Fleet Console. As it leaves:`)]
  if (siteName) {
    lines.push(wrap(`• its site, ${siteName}, stops taking part in HQ and runs no agents; its data stays on this machine until you erase it (${cmd('site erase')});`, IN))
  }
  lines.push(wrap('• its own backups, and the backup location set for it, stay on this machine.', IN))
  return lines.join('\n')
}

const LEFT: Record<NonNullable<DisconnectResult['hq']>, (site: string | null) => string> = {
  told: site => site
    ? ` HQ was told it left: the site ${site} no longer takes part, and fleet admins are asked to remove this machine in the Fleet Console.`
    : ' HQ was told it left: fleet admins are asked to remove this machine in the Fleet Console.',
  alreadyRemoved: site => site ? ` HQ had already taken the site ${site} out.` : ' HQ had already taken this machine out of the fleet.',
  notYet: site => ' HQ did not answer, so it does not know yet: this machine tells it as soon as HQ answers again.' +
    (site ? ` Until then HQ lists the site ${site} as not heard from.` : ' Until then HQ lists this machine as not heard from.'),
}

export function disconnected(r: DisconnectResult): string {
  return wrap('Disconnected. This machine dropped its credential and no longer answers the Fleet Console.' +
    (r.hq ? LEFT[r.hq](r.siteName) : ''))
}

/** `port`: the one asked for, else the one the Fleet Console here already has; without either, the default. */
export function consoleInstallWarning(machine: string, port?: number): string {
  const address = port === undefined ? DEFAULT_CONSOLE_ADDRESS : consoleAddress(port)
  return wrap(`This starts the Fleet Console here, on ${machine}, and retires the one that runs now. Its screen is on ` +
    `${address.replace('http://', '')} of this machine only, and it runs no agents. It keeps one connection out to HQ and accepts none.`)
}

export function consoleInstalled(r: ConsoleInstallResult): string {
  const open = `Open ${r.address} here and sign in with your HQ account; you need the fleet admin role.`
  const t = r.takeover
  if (t?.state === 'handedOver') {
    const rest = t.repinned < t.hosts ? ' The others follow it when they next connect to HQ.' : ''
    return wrap(`Moved. The Fleet Console now runs on ${r.machine}, and ${t.repinned} of ${t.hosts} machines follow it.${rest} ${open}`)
  }
  if (t?.state === 'fresh') {
    return [
      wrap(`Started. The Fleet Console runs on ${r.machine} now, with no machines: none was running to hand them over. ${open}`),
      nextStep('Each machine connects to it again: a fleet admin chooses Add a site here, and the machine admin runs', cmd('console connect <hq address> <code>')),
    ].join('\n')
  }
  if (t?.state === 'failed') return wrap(`Not moved. ${t.problem}`)
  return [
    wrap(`Started. The Fleet Console runs on ${r.machine} now, but has not connected to HQ yet. ${open}`),
    nextStep("If it does not let anyone in, its code may have run out: ask a machine admin of HQ's machine for a new one, made with", cmd('hq console-code')),
  ].join('\n')
}

/**
 * `here`: a Fleet Console runs here now and hands its machines over. `elsewhere`: this machine answers one on another
 * machine, which it asks. Otherwise HQ makes a code for a new one.
 */
export function consoleCodeQuestion(machine: string, where: 'here' | 'elsewhere' | 'none'): string {
  if (where === 'elsewhere') {
    return wrap(`The Fleet Console runs on another machine, and ${machine} is one of the machines it manages. A code from it ` +
      `lets it run on another machine instead, or back here: every machine it manages follows it, and the one that runs now ` +
      `is then retired. ${machine} asks it for the code in a sealed message HQ cannot read.`)
  }
  if (where === 'here') {
    return wrap(`The Fleet Console runs on ${machine}. A code lets it run on another machine instead, even a fleet ` +
      "admin's own computer: every machine it manages follows it, and the one here is then retired. It does not move when HQ moves.")
  }
  return wrap(`No Fleet Console is running on ${machine}. A code from HQ starts one on another machine with no machines: ` +
    `each machine connects to it again (${cmd('console connect')}), and a Fleet Console that still runs elsewhere is retired. ` +
    'If the Fleet Console here is only stopped, start it first, and every machine follows the new one instead.')
}

export function consoleCodeMade(r: ConsoleCodeResult, now: Date): string {
  const minutes = Math.max(1, Math.round((Date.parse(r.expiresAt) - now.getTime()) / 60_000))
  return [
    `  Code: ${r.code}`,
    wrap(`It works once, for ${minutes >= 60 ? '1 hour' : `${minutes} minutes`}. On the machine that is to run the Fleet Console, with ${product}'s host service running there, run:`),
    `  ${cmd(`console install ${r.hqAddress} ${r.code}`)}`,
    ...(r.elsewhere ? [wrap(`To bring the Fleet Console back to this machine instead, run the same command here, on ${r.machine}.`)] : []),
  ].join('\n')
}

export function consoleRetiredHere(r: Pick<ConsoleCodeResult, 'kind' | 'elsewhere'>): string {
  if (r.kind === 'fresh') {
    return wrap('Once the Fleet Console on the other machine connects, HQ lets in no other: any running elsewhere is retired, and machines connect to the new one again.')
  }
  const one = r.elsewhere ? 'the one that runs now' : 'the one here'
  return wrap(`Once the new Fleet Console connects, ${one} hands it every machine and is retired. Every fleet admin and organisation admin has been told.`)
}

/** `hq console-code --no-machines`: asked before anything is made, since every machine must connect again. */
export function noMachinesQuestion(machine: string): string {
  return wrap(`This is for when the Fleet Console ran on another machine and that machine is lost. HQ makes the code ` +
    `itself, so the new Fleet Console starts with no machines: every machine, ${machine} too, must connect to it again ` +
    `with ${cmd('console connect <hq address> <code>')}, using a code a fleet admin makes in it. ${machine} leaves the ` +
    `Fleet Console it answers now. If that Fleet Console still runs, use ${cmd('hq console-code')} without --no-machines ` +
    'instead: every machine then follows by itself.')
}

export function noMachinesMade(r: Pick<ConsoleCodeResult, 'machine' | 'leftPin'>): string {
  return wrap(`Once the new Fleet Console connects, HQ lets in no other. ${r.leftPin ? `${r.machine} no longer answers the one before. ` : ''}` +
    `In the new one, a fleet admin adds each machine with Add a site, and its machine admin runs ${cmd('console connect')} with that code.`)
}

export const fleetAdminQuestion = (user: string) => wrap(
  `Give "${user}" the fleet admin role? A fleet admin can open the Fleet Console, which looks after every machine and ` +
  'site of the organisation. Their HQ password stays theirs.',
)

export const fleetAdminRemoveQuestion = (user: string) => wrap(
  `Take the fleet admin role away from "${user}"? They can no longer open the Fleet Console. Their HQ account stays as it is.`,
)

/** `agenthix status`, under the machine's name: whether this machine answers a Fleet Console. */
export function managementLines(m: ManagementStatus | undefined, hasHq: boolean, hasSite: boolean, replaced = false): string[] {
  if (!m) return []
  const lines: string[] = []
  if (m.cloud?.enrolled) {
    lines.push(wrap(`Managed by Agenthix Cloud (machine ${m.cloud.machineId}, Cloud's fingerprint ${m.cloud.fingerprint}), ` +
      `${m.cloud.connected ? 'connected' : 'not connected right now'}.`))
    return lines
  }
  if (m.cloud && m.cloud.problem) lines.push(wrap(`Set up for Agenthix Cloud, not enrolled yet: ${m.cloud.problem}`))
  const by = m.managedBy
  // Its site was restored onto another machine (adr-0119): that machine took this one's place in the fleet.
  if (by && !by.local && replaced) {
    lines.push(wrap(`Was managed by a Fleet Console (its fingerprint ${by.fingerprint}), through HQ at ${by.hqAddress}. ` +
      'HQ no longer accepts this machine: it left the fleet when its site was restored onto another machine. ' +
      'To stop answering that Fleet Console:'))
    lines.push(`  ${cmd('console disconnect')}`)
    return lines
  }
  if (by && !by.local) {
    lines.push(wrap(`Managed by a Fleet Console (its fingerprint ${by.fingerprint}), through HQ at ${by.hqAddress}. ` +
      (by.connected ? 'Connected.' : 'Not connected just now; it reconnects by itself.')))
    const r = m.receiving
    if (r?.ended) lines.push(moveDidNotHappen(r.kind, r.siteName, r.from, r.ended))
    else if (r) {
      const what = r.kind === 'hq' ? `HQ and its site ${r.siteName}` : `the site ${r.siteName}`
      lines.push(wrap(r.waiting
        ? `Waiting to receive ${what} from ${r.from}; it starts nothing of its own meanwhile.`
        : `Taking in ${what} from ${r.from} now.`))
    }
    // hq said it moves, and the new address has not passed this machine's check yet (spec §13).
    if (by.moving) lines.push(movingLines(by.moving.from, by.moving.to, by.moving.since, 'machine', ''))
    else if (!by.connected) {
      lines.push(wrap('If HQ moved while this machine was off, get its new address from a fleet admin and set it:'))
      lines.push(`  ${cmd('console hq-address <address>')}`)
    }
  } else if (!by && !hasHq) {
    lines.push(wrap(`Not managed by a Fleet Console${hasSite ? '' : ', so no site runs here'}. To ${hasSite ? 'connect it' : 'add one'}, a fleet admin chooses Add a site in the Fleet Console and gives you a code:`))
    lines.push(`  ${cmd('console connect <hq address> <code>')}`)
  }
  return lines
}

/** `agenthix status`: the Fleet Console that runs on this machine, if one does. */
export function consoleHereLines(m: ManagementStatus | undefined, hasHq = true): string[] {
  const here = m?.consoleHere
  const by = m?.managedBy
  const lines: string[] = []
  // HQ's own Fleet Console reaches HQ on this machine, and one HQ's machine pins is never one to take away.
  const notIn = here?.hq === 'refused' ? (here.onHqMachine && by?.local ? null : here.hq)
    : here?.hq === 'notConnected' && !here.onHqMachine ? here.hq : null
  if (here) {
    lines.push(`Fleet Console  ${here.address}  ${here.version}`)
    if (here.containers !== 'running') {
      lines.push(here.onHqMachine ? nextStep('Not running. To start it again:', cmd('install'), IN) : wrap('Not running.', IN))
    } else if (notIn) {
      lines.push(...consoleNotInLines(notIn, IN))
    } else if (here.onHqMachine) {
      lines.push(wrap(by?.local
        ? 'Running. This machine is connected to it. Fleet admins open it here, or through an SSH tunnel.'
        : 'Running. This machine is not connected to it yet; it keeps trying by itself.', IN))
    } else lines.push(wrap('Running. Fleet admins open it here, or through an SSH tunnel, and sign in with their HQ accounts.', IN))
  } else if (m?.retiredHere) {
    lines.push('Fleet Console')
    lines.push(wrap(`Retired here. It runs on ${m.retiredHere.machineName} now, and fleet admins open it there.`, IN))
    // The code to bring it back comes from HQ's machine, so elsewhere the command here takes one made there.
    lines.push(hasHq
      ? nextStep('To bring it back here:', cmd('hq console-code'), IN)
      : nextStep(`To bring it back here, a machine admin of HQ's machine runs ${cmd('hq console-code')} there; then here:`,
        cmd('console install <hq address> <code>'), IN))
  }
  return lines
}
