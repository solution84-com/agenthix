/**
 * What the CLI prints around its commands (the CLI board's *Installing*, *The machine's way into hq* and
 * *agenthix help*). HQ is in capitals; commands, host names and addresses keep `hq`.
 */
import { BRANDING } from '@agenthix/core'
import type { HqLinkResult, InstallResult } from '../owner/results'
import { hostContainer } from './hostContainer'
import { HELP, type HelpRow } from './commands'
import { CLOUD_HELP } from './cloud'
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
  const files = filesOriginFor(r.address)
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
  if (r.firstAccountLink) {
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

export function helpText(version: string, topic?: string): string {
  const rows = [...HELP, ...CLOUD_HELP, ...PROVIDER_HELP]
  if (topic) {
    const row = rows.find(r => r.usage.split(' [')[0].split(' <')[0].split(' --')[0] === topic) ??
      (topic.includes(' ') ? rows.find(r => r.usage.split(' ').slice(0, topic.split(' ').length).join(' ') === topic) : undefined)
    if (!row) return `There is no command "${topic}". ${cmd('help')} lists them.`
    return [cmd(row.usage), '', wrap(row.detail, '  ')].join('\n')
  }
  const lines = [
    `${BRANDING.cliCommand} ${version} — runs ${product} on this machine.`,
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
