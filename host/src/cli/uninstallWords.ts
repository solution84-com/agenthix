/**
 * What a person reads of `agenthix uninstall` (the CLI board's *Warnings that ask before acting*): the warning that
 * lists exactly what goes, what an erase left in the bin, and what it never touches; then what was not removed.
 */
import type { Binned, UninstallPlan } from '../lifecycle/uninstall'
import type { Uninstalled } from '../lifecycle/uninstallSteps'
import { fullDate } from './backupWords'
import { cmd, product, wrap } from './words'

const IN = '  '
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const listed = (things: string[]) => things.join(', ')
/** A list item, wrapped under its own first word. */
const bullet = (text: string) => `${IN}- ${wrap(text, `${IN}  `).slice(IN.length + 2)}`

function lines(p: UninstallPlan): string[] {
  const out: string[] = []
  if (p.fleetConsole) out.push('the Fleet Console, with its keys')
  if (p.agentContainers) out.push(`${plural(p.agentContainers, 'agent container')}`)
  if (p.firewallTable) out.push(`the agent protections' firewall table, ${p.firewallTable}`)
  if (p.volumes.length) out.push(`the ${p.volumes.length === 1 ? 'volume' : 'volumes'} ${listed(p.volumes)}`)
  if (p.networks.length) out.push(`the ${p.networks.length === 1 ? 'network' : 'networks'} ${listed(p.networks)}`)
  if (p.images.length) out.push(`${plural(p.images.length, 'image')} it fetched, each unless another container uses it`)
  if (p.stateFolder) {
    const held = [p.backupsOnMachine ? plural(p.backupsOnMachine, 'backup') : '', p.exports ? plural(p.exports, 'export') : ''].filter(Boolean)
    out.push(`what is in the state folder, ${p.stateFolder}${held.length ? `, with the ${held.join(' and ')} in it` : ''}`)
  }
  if (p.hostContainers.length) out.push(`the host service's ${p.hostContainers.length === 1 ? 'container' : 'containers'} ${listed(p.hostContainers)}, last`)
  return out
}

function binned(b: Binned): string {
  const what = b.target === 'hq' ? `HQ at ${b.name}` : `The site ${b.name}`
  const copies = b.location ? ` Its copies in the backup location, ${b.location}, stay there.` : ''
  return wrap(`${what} was erased on ${fullDate(new Date(b.erasedAt))}, and its final backup is kept here until ${fullDate(new Date(b.purgeAfter))}. Uninstalling purges it now, and it cannot be brought back.${copies} To keep it instead, press Enter, and until then ${cmd(`${b.target} restore`)} brings it back.`)
}

export function uninstallWarning(p: UninstallPlan): string {
  const out = [wrap(`This takes ${product} off ${p.machine}, leaving nothing of it behind. It removes:`), '']
  for (const line of lines(p)) out.push(bullet(line))
  out.push('')
  const kept = [
    p.backupLocation ? `Your backup location, ${p.backupLocation}, is not touched: the copies there stay.` : 'Nothing outside the state folder is touched.',
    p.stateFolder && p.exports ? `Copy any export you want to keep out of ${p.stateFolder}/exports first.` : '',
  ].filter(Boolean).join(' ')
  out.push(wrap(kept), '')
  for (const b of p.binned) out.push(binned(b), '')
  return out.join('\n')
}

export const purgePrompt = (b: Binned) => b.target === 'hq' ? "To purge it now, type HQ's address: " : "To purge it now, type the site's name: "

export const notPurged = (b: Binned) =>
  wrap(`Not uninstalled: that is not ${b.target === 'hq' ? "HQ's address" : "the site's name"}. Nothing was removed.`)

export function uninstalledText(r: Uninstalled, hostImage: string | null): string {
  const out: string[] = []
  if (r.helper) {
    out.push(wrap(`In a few seconds ${r.helper} removes the host service's own container and its volume, and empties the state folder, then itself.` +
      (r.stateFolder ? ` It cannot reach anything beside that folder, so remove the empty folder yourself: rmdir ${r.stateFolder}` : '')))
    out.push(wrap(`If it is still listed by docker ps -a after a minute, docker logs ${r.helper} says what it left.`))
  }
  if (r.imagesKept) out.push(wrap(`${plural(r.imagesKept, 'image')} another container uses ${r.imagesKept === 1 ? 'was' : 'were'} left for it.`))
  if (hostImage) out.push(wrap(`The host service's image stays, since its last step runs from it. To remove it afterwards: docker image rm ${hostImage}`))
  if (r.notRemoved.length) {
    out.push('', 'Not removed:')
    for (const n of r.notRemoved) out.push(bullet(`${n}.`))
    out.push('', wrap(`Running ${cmd('uninstall')} again removes what is left; if the host service is gone, start it again with the command it was started with, then run it.`))
  }
  return [r.notRemoved.length ? 'Uninstalled, but not all of it.' : 'Uninstalled.', ...out].join('\n')
}
