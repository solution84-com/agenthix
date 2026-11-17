/**
 * What the CLI prints around its commands (the CLI board's *Installing*, *The machine's way into hq* and
 * *agenthix help*). HQ is in capitals; commands, host names and addresses keep `hq`.
 */
import { BRANDING, DEMO_RESET_EVERY_HOURS, LANDLOCK_ABI_COMMAND, LANDLOCK_REQUIRED_ABI, LANDLOCK_REQUIRED_LINUX } from '@agenthix/core'
import type { HqLinkResult, InstallResult } from '../owner/results'
import { hostContainer } from './hostContainer'
import { HELP, type HelpRow } from './commands'
import { CLOUD_HELP } from './cloud'
import { cloudFeatureOn } from '../cloud/flag'
import { PROVIDER_HELP } from './provider'
import { filesOriginFor } from '../install/address'
import { cmd, nextStep, product, wrap } from './words'

export const ADDRESS_QUESTION = [
  `Where will people open HQ, the organisation's own ${product}?`,
  'Its address, as people will type it in a browser.',
]

export function localAddressNote(address: string, machine: string): string {
  return wrap(
    `Note: people on other computers cannot open ${address}, and sites on other machines cannot reach HQ at it. ` +
    `The site on ${machine} is not affected: it reaches HQ over a private Docker network, never through this address.`,
  )
}

/** The two-line shortcut the person may save themselves; the host service never writes into the machine's folders (spec §17). */
export function shortcutLines(machine: string): string {
  const name = BRANDING.cliCommand
  const script = `printf '#!/bin/sh\\nexec docker exec -it ${hostContainer()} ${name} "$@"\\n'`
  return [
    wrap(`To type "${cmd('status')}" instead of "docker exec -it ${hostContainer()} ${cmd('status')}", save a shortcut. ` +
      `${product} does not write into this machine's own folders: run ONE of these lines yourself, on ${machine}, outside this window's container.`),
    '',
    `  For everyone on ${machine} (asks for your password once):`,
    `    ${script} | sudo tee /usr/local/bin/${name} >/dev/null && sudo chmod 755 /usr/local/bin/${name}`,
    '  Just for you (no password; ~/.local/bin must be on your PATH):',
    `    ${script} > ~/.local/bin/${name} && chmod 755 ~/.local/bin/${name}`,
    '',
    wrap(`Skip it if you like: docker exec -it ${hostContainer()} ${name} <command> works the same.`),
  ].join('\n')
}

function serving(r: InstallResult): string | null {
  const at = `${r.listen.bind}:${r.listen.port}`
  const files = r.filesOrigin !== undefined ? r.filesOrigin : filesOriginFor(r.address)
  if (r.address.startsWith('https://')) {
    return [
      wrap(`HQ listens on ${at}. To serve it at ${r.address}, point this machine's web server at ${at} ` +
        `(it holds the certificate)${files ? `, and ${files}, where uploaded files are served, at the same place` : ''} ` +
        `— the guide's page "Run it on a server" shows how.`),
      nextStep(`Or let ${product} take ports 80 and 443 for it:`, cmd('front-door on')),
    ].join('\n')
  }
  if (r.listen.bind === '0.0.0.0') {
    return wrap(`HQ answers on this machine's network at ${r.address}, in plain http. Before people use it from other ` +
      `computers, put a web server with a certificate in front of it and use its https address.` +
      (files ? '' : ' Until HQ has a host name, uploaded files are offered only as downloads, so that none can act as HQ.') +
      ' Voice and dictation do not work at this address: a browser gives the microphone only to a page on https ' +
      `(a web server with a certificate, or ${product}'s optional front door, ${cmd('front-door on')}), ` +
      'or to HQ installed at localhost and opened on its own machine.')
  }
  return null
}

export function installDone(r: InstallResult, machine: string): string {
  const parts: string[] = []
  const serve = serving(r)
  if (serve) parts.push(serve)
  parts.push(shortcutLines(machine))
  parts.push(wrap(`Installed. HQ runs on ${machine}, carried by its site, ${r.siteName}.`))
  if (!r.siteConnected) {
    parts.push(nextStep(`The site ${r.siteName} has not connected to HQ yet. To see how it is doing:`, cmd('status')))
  }
  if (r.demo) {
    parts.push(wrap(`This is a demo: HQ seeds its sample organisation as it starts, and visitors enter at ${r.address} with one button. ` +
      `It is reset every ${DEMO_RESET_EVERY_HOURS} hours, and on ${cmd('demo reset')}.`))
  } else if (r.firstAccountLink) {
    parts.push([
      wrap("No one has an account in HQ yet. Open this link to make the first one, HQ's first organisation admin. The link works once, for 24 hours:"),
      `  ${r.firstAccountLink}`,
      nextStep('Lost it, or it expired?', `${cmd('hq invite-admin')} makes a new one.`),
    ].join('\n'))
  } else if (r.users > 0) {
    parts.push(wrap(`HQ already has people: sign in at ${r.address}.`))
  } else {
    parts.push(nextStep('HQ did not make the link for the first account. To make it:', cmd('hq invite-admin')))
  }
  parts.push(nextStep('Next time,', `${cmd('status')} shows how everything on ${machine} is doing.`))
  return parts.join('\n\n')
}

/** What a refused kernel check stopped (`install/landlock.ts`). */
export type KernelCheckFor = 'install' | 'connect' | 'upgrade'

const KERNEL_STOPPED: Record<KernelCheckFor, string> = {
  install: `${product} was not installed`,
  connect: 'This machine was not connected to a Fleet Console',
  upgrade: 'Not upgraded',
}

/** Whether a kernel release (`6.8.0-48-generic`) is older than the one with the Landlock agents need; null when unread. */
function olderKernel(kernel: string): boolean | null {
  const m = /^(\d+)\.(\d+)/.exec(kernel)
  if (!m) return null
  const [major, minor] = LANDLOCK_REQUIRED_LINUX.split('.').map(Number)
  return Number(m[1]) < major || (Number(m[1]) === major && Number(m[2]) < minor)
}

/**
 * The fix for the system Docker reports (`docker info`): Docker Desktop's own kernel is updated with Docker Desktop;
 * Ubuntu 24.04 and Debian 12 have a newer kernel of their own to install.
 */
function kernelFix(system: string): string {
  const then = 'restart the machine, then run this again.'
  if (/^Docker Desktop/i.test(system)) return 'To fix it, update Docker Desktop, which brings its own kernel, then run this again.'
  if (/^Ubuntu 24\.04/i.test(system)) return `To fix it, install Ubuntu 24.04's newer kernel (sudo apt install linux-generic-hwe-24.04), ${then}`
  if (/^Debian GNU\/Linux 12\b/i.test(system)) {
    return "To fix it, install Debian 12's newer kernel from bookworm-backports (with backports in apt's sources: " +
      `sudo apt install -t bookworm-backports linux-image-amd64, or linux-image-arm64 on ARM), ${then}`
  }
  return `To fix it, install a kernel of Linux ${LANDLOCK_REQUIRED_LINUX} or newer (Debian 13 has one), ${then}`
}

/**
 * Why an install, a join or an upgrade was refused on a kernel that cannot contain agents' commands: what was found,
 * what is needed, and the fix for this machine's system. `abi` is null when the launcher's answer could not be read,
 * which on a kernel new enough is no kernel's fault, so the fix is then to try again.
 */
export function kernelRefusal(o: { for: KernelCheckFor; abi: number | null; kernel: string; system: string }): string {
  const machine = `Linux ${o.kernel || 'of a version Docker did not say'}${o.system ? `, ${o.system}` : ''}`
  const needed = `Agents' commands are contained with the kernel's Landlock ${LANDLOCK_REQUIRED_ABI}, which Linux ${LANDLOCK_REQUIRED_LINUX} and newer have.`
  if (o.abi === null) {
    const fix = olderKernel(o.kernel) === false
      ? `Run this again; if it is refused again, the agent image's answer is the problem: docker run --rm <the agent image> ${LANDLOCK_ABI_COMMAND.join(' ')} prints it.`
      : kernelFix(o.system)
    return `${KERNEL_STOPPED[o.for]}: this machine's kernel (${machine}) could not be asked whether it can keep agents' commands ` +
      `contained, so no agent may be able to work here. ${needed} Nothing was changed. ${fix}`
  }
  const has = o.abi === 0 ? 'no Landlock' : `Landlock ${o.abi}`
  return `${KERNEL_STOPPED[o.for]}: this machine's kernel (${machine}) cannot keep agents' commands contained, so no agent ` +
    `could work here. It has ${has}. ${needed} Nothing was changed. ${kernelFix(o.system)}`
}

export const INVITATION_QUESTION = (people: number) => wrap(
  `HQ has ${people === 1 ? '1 person' : `${people} people`}. This is for when no organisation admin can sign in. ` +
  "It makes an invitation to join as an organisation admin, marked in HQ as made on HQ's machine, and every organisation admin is told.",
)

const hours = (n: number) => (n === 1 ? '1 hour' : `${n} hours`)

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function linkMade(r: HqLinkResult, address: string, user?: string): string {
  const told = r.toldAdmins.length > 0
  if (r.kind === 'firstAccount') {
    return [
      wrap(`HQ at ${address} has no account yet. Open this link to make the first one. It works once, for ${hours(r.validHours)}:`),
      `  ${r.link}`,
      'Any earlier first-account link no longer works.',
    ].join('\n')
  }
  if (r.kind === 'invitation') {
    return [
      wrap(`An invitation to join as an organisation admin. It works once, for ${hours(r.validHours)}:`),
      `  ${r.link}`,
      told ? wrap(`${nameList(r.toldAdmins)} ${r.toldAdmins.length === 1 ? 'has' : 'have'} been told.`) : 'The organisation admins have been told.',
    ].join('\n')
  }
  const who = r.person?.name ?? user
  return [
    wrap(`A one-time link for ${who} to set a new password. It works once, for ${hours(r.validHours)}:`),
    `  ${r.link}`,
    wrap(`HQ does not send it: give it to ${who} yourself. ` + (told
      ? `${nameList(r.toldAdmins)} ${r.toldAdmins.length === 1 ? 'has' : 'have'} been told that a password was reset from HQ's machine.`
      : "The other organisation admins have been told that a password was reset from HQ's machine.")),
  ].join('\n')
}

export const userNotFound = (user: string) =>
  wrap(`Not found: no one signs in to HQ as "${user}". Use the name they type at sign-in, which HQ shows on their page under People.`)

/** The list is read across, so it takes a wider terminal than prose does. */
const HELP_WIDTH = 78

const GROUPS: Record<HelpRow['group'], string> = {
  machine: 'This machine',
  hq: "HQ (on HQ's machine)",
  site: "The site (exactly one per machine; on HQ's machine it carries HQ)",
  console: 'The Fleet Console',
  cloud: 'Agenthix Cloud',
}

/** `version`: the host service's, or null when it did not answer. */
export function helpText(version: string | null, topic?: string): string {
  const rows = [...HELP, ...(cloudFeatureOn() ? CLOUD_HELP : []), ...PROVIDER_HELP]
  if (topic) {
    const row = rows.find(r => r.usage.split(' [')[0].split(' <')[0].split(' --')[0] === topic) ??
      (topic.includes(' ') ? rows.find(r => r.usage.split(' ').slice(0, topic.split(' ').length).join(' ') === topic) : undefined)
    if (!row) return `There is no command "${topic}". ${cmd('help')} lists them.`
    return [cmd(row.usage), '', wrap(row.detail, '  ')].join('\n')
  }
  const lines = [
    `${BRANDING.cliCommand}${version ? ` ${version}` : ''} — runs ${product} on this machine.`,
    `Without the shortcut, type: docker exec -it ${hostContainer()} ${BRANDING.cliCommand} <command>`,
  ]
  for (const group of Object.keys(GROUPS) as HelpRow['group'][]) {
    const inGroup = rows.filter(r => r.group === group)
    if (!inGroup.length) continue
    lines.push('', GROUPS[group])
    for (const row of inGroup) {
      const first = `  ${row.usage.padEnd(26)}`
      const does = wrap(row.does, ' '.repeat(28), HELP_WIDTH)
      lines.push(row.usage.length > 24 ? `  ${row.usage}\n${does}` : first + does.trimStart())
    }
  }
  return lines.join('\n')
}
