/**
 * The words of hq's address moving (host-management spec §13; the CLI board's *agenthix site hq-address*,
 * *agenthix console hq-address* and *A machine whose site is mid-move*): what the check is, how it ended, and what
 * to do next. The host service says them as it works, and the CLI prints them.
 */
import type { MoveCheckOutcome } from '@agenthix/core'
import { hqAddressProblem } from '../link/socket'
import { cmd, nextStep, product, wrap } from './words'

export type Who = { kind: 'site'; name: string } | { kind: 'machine'; name: string }

const whose = (who: Who) => (who.kind === 'site' ? "this site's" : "this machine's")
const holder = (who: Who) => (who.kind === 'site' ? 'this site' : 'this machine')

export function checking(address: string, who: Who): string {
  return [
    `Checking ${address} is that same HQ …`,
    wrap(`It proves it holds the record of ${whose(who)} credential, and ${holder(who)} proves it knows the credential. The credential itself never crosses the network.`, '  '),
  ].join('\n')
}

export const CHECK_STEP = 'The check'

export const checkStepOutcome = (outcome: MoveCheckOutcome) => (outcome === 'passed' ? 'passes' : outcome === 'unreachable' ? 'no answer' : 'fails')

/** Why nothing changed, after a check that did not pass. */
export function notChanged(outcome: Exclude<MoveCheckOutcome, 'passed'>, address: string, who: Who, stillUses: string): string {
  const stays = who.kind === 'site' ? `The site still uses ${stillUses}.` : `This machine still uses ${stillUses} and told it nothing.`
  switch (outcome) {
    case 'unreachable':
      return wrap(`Not changed: nothing answers at ${address}. HQ may not have finished moving. Try again later.`)
    case 'notThisHq':
      return [
        wrap(`Not changed: ${address} is an ${product} HQ, but not the one ${holder(who)} belongs to: it could not prove it holds ${whose(who)} credential. ${stays}`),
        wrap(`It learned nothing from ${holder(who)} and took nothing over. Check the address with a fleet admin; HQ's Settings page shows the address it has now.`),
      ].join('\n')
    case 'notHq':
      return wrap(`Not changed: ${address} does not answer as an ${product} HQ. ${stays} Check the address with a fleet admin.`)
  }
}

export function sitePointed(siteName: string, address: string): string {
  return wrap(`Connected. The site ${siteName} now uses ${address}. The old address is forgotten.`)
}

export type MachineConsole = 'here' | 'elsewhere' | 'notFollowed' | 'onHqMachine'

export function machinePointed(machine: string, address: string, fleetConsole: MachineConsole, siteName: string | null): string {
  const lines = [wrap(`Connected. ${machine} now reaches HQ at ${address}.`)]
  lines.push(wrap(fleetConsole === 'here'
    ? 'The Fleet Console runs on this machine, and it uses the new address now too.'
    : fleetConsole === 'notFollowed'
      ? `The Fleet Console runs on this machine, but it did not take the new address; it keeps trying by itself.`
      : 'The Fleet Console does not move with HQ. If it runs on another machine, it follows by itself, or by this command on its own machine.'))
  if (siteName) {
    lines.push(wrap('The site here was offline too, so it needs the address as well:'))
    lines.push(`  ${cmd(`site hq-address ${address}`)}`)
  }
  return lines.join('\n')
}

/** The status lines of a move that has not completed: hq told it a new address, which has not passed yet. */
export function movingLines(from: string, to: string, since: string, who: 'site' | 'machine', indent = '  '): string {
  const t = new Date(since)
  const clock = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  const subject = who === 'site' ? 'this site' : 'this machine'
  const keeps = who === 'site' ? 'The site keeps' : 'It keeps'
  const command = who === 'site' ? `site hq-address ${to}` : `console hq-address ${to}`
  return [
    wrap(`Moving. HQ told ${subject} it is moving from ${from} to ${to}. ${keeps} using the old address until the new one passes the check; it has tried since ${clock} and the new address has not passed yet.`, indent),
    nextStep('If the move has finished, check the new address with a fleet admin, then:', cmd(command), indent),
  ].join('\n')
}

/** `hq address <address>`, before it asks. */
export function hqAddressWarning(from: string, to: string): string {
  const refused = hqAddressProblem(to)
  return [
    wrap(`HQ moves from ${from} to ${to}. Changing HQ's address is a move: HQ tells every connected site and host service the new address, stops, takes a sealed backup, and starts again at ${to}. Nothing can change in between, and runs going now stop.`),
    wrap(`Each site and host service switches once ${to} passes its check. One that is offline now needs the address on its machine afterwards, the machine's first:`),
    `  ${cmd(`console hq-address ${to}`)}`,
    `  ${cmd(`site hq-address ${to}`)}`,
    ...(refused ? ['', wrap(`Other machines and the Fleet Console will not follow HQ to ${to}, and stay waiting on ${from}: ${refused}. If any is connected, give HQ an https address instead.`)] : []),
  ].join('\n')
}

export type Told = { sites: { told: number; of: number }; hosts: { told: number; of: number }; console: boolean }

export function hqMoved(address: string, told: Told | null): string {
  const lines = [wrap(`Moved. HQ answers at ${address}. Everyone in HQ was told the new address.`)]
  if (told) {
    lines.push(wrap(`${told.sites.told} of ${told.sites.of} sites and ${told.hosts.told} of ${told.hosts.of} host services were told over the connection each already has; each switches once the new address passes its check.`))
    if (told.sites.told < told.sites.of || told.hosts.told < told.hosts.of) {
      lines.push(wrap('The others were offline or too old to be told. On each of their machines, the machine first:'))
      lines.push(`  ${cmd(`console hq-address ${address}`)}`, `  ${cmd(`site hq-address ${address}`)}`)
    }
  }
  return lines.join('\n')
}
