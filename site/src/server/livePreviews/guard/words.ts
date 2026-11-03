/** What the guard says it found and did, in a sentence the people who have the live preview open read. */
import type { GuardSignal, GuardStep } from '@agenthix/core'

const FOUND: Record<GuardSignal, string> = {
  offTemplate: 'its container was changed from how the site made it',
  notMadeBySite: 'something the site did not start appeared in it',
  unexpectedProcess: 'a process started that is not one of its apps',
  unexpectedPort: 'a port opened that is not one of its apps\'',
  blockedAddresses: 'it kept trying to reach private addresses or this machine',
  privilegeChange: 'a process tried to gain privileges',
  readOnlyWrite: 'something tried to write where nothing may',
  linkRefused: 'it asked the site to follow a link out of its copy',
  relayRefusals: 'the relay refused too many requests to one of its apps',
  unusualUse: 'it used far more processor, memory or network than its pattern, with nothing working',
  protectionsDown: 'the network protections that keep live previews off private addresses do not hold',
  guardDown: 'the guard could not watch it',
}

const DID: Record<GuardStep, string> = {
  previewStopped: 'stopped it',
  processKilled: 'ended that process',
  paused: 'paused it',
  refused: 'refused the request',
  alerted: 'told the people who have it open',
  appStopped: 'stopped the app',
  asked: 'asks a person whether to resume it',
}

export function guardDetail(signal: GuardSignal, steps: GuardStep[], what?: string): string {
  const did = steps.filter(s => s !== 'alerted').map(s => DID[s])
  const found = `${FOUND[signal]}${what ? ` (${what})` : ''}`
  return `The live-preview guard found that ${found}, and ${did.length ? did.join(', ') : 'did nothing more'}.`
}
