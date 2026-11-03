/**
 * What a person reads about a live preview: why it paused or stopped, and why HQ or the site would not start or change
 * one. A site's own sentence is never shown; hq says it in its own words from the code the site answered. Every refusal
 * says what is wrong, who holds it, what to do, and ends "Nothing was changed." when nothing was.
 */
import { HttpError } from 'wasp/server'
import type {
  GuardSignal, LivePreviewPauseReason, LivePreviewRefusal, LivePreviewStopReason,
} from '@agenthix/core'

export const NOTHING = 'Nothing was changed.'

const GUARD_FOUND: Record<GuardSignal, string> = {
  offTemplate: 'a container that no longer matches its template',
  notMadeBySite: 'a container or process the site did not start',
  unexpectedProcess: 'a process nobody started',
  unexpectedPort: 'a port nobody opened',
  blockedAddresses: 'repeated attempts to reach private addresses',
  privilegeChange: 'an attempt to gain privileges',
  readOnlyWrite: 'a write to a read-only folder',
  linkRefused: 'a link pointing outside its working copy',
  relayRefusals: 'many requests the relay refused',
  unusualUse: 'unusual use of CPU, memory or traffic with no agent working',
  protectionsDown: 'its network protections not holding',
  guardDown: 'that it could not check the live preview',
}

/** What the guard found, in a few words; a signal hq has no words for reads as "something unexpected". */
export function guardFound(signal: GuardSignal | string | null): string {
  if (!signal) return 'something unexpected'
  return GUARD_FOUND[signal as GuardSignal] ?? `something unexpected (${String(signal).slice(0, 40)})`
}

export function pausedDetail(reason: LivePreviewPauseReason, signal: string | null, site: string): string {
  if (reason === 'lineLost') return `${site} lost its line to HQ, so the live preview is paused. It carries on by itself once the line is back.`
  return `The guard on ${site} found ${guardFound(signal)} and paused the live preview. Read what it found, then resume it.`
}

export function stoppedDetail(reason: LivePreviewStopReason, site: string, signal: string | null = null): string {
  switch (reason) {
    case 'person': return 'It was stopped. Its branch, its copy and its work are untouched.'
    case 'projectAdmin': return 'An admin of the project stopped it. Its branch and its work are untouched.'
    case 'fleetAdmin': return 'A fleet admin stopped it in the Fleet Console. Its branch and its work are untouched.'
    case 'idle': return 'Nobody had it open and no agent was working on its branch, so it stopped. Start it again whenever you want it.'
    case 'turnedOff': return `A fleet admin turned live previews off on ${site}.`
    case 'guard': return `The guard on ${site} found ${guardFound(signal)} and stopped it.`
    case 'resources': return `${site} ran out of memory, so the live preview was stopped to keep it running.`
    case 'merged': return 'Its branch was merged into main and closed.'
    case 'failed': return `It did not start on ${site}. Nothing was left behind.`
  }
}

/** A site's refusal, as a person reads it. `site` is the site's name, `branch` the branch's. */
export function refusalWords(r: LivePreviewRefusal, site: string, branch: string): string {
  switch (r.code) {
    case 'turnedOff': return `Live previews are off on ${site}. A fleet admin turns them on in the Fleet Console. ${NOTHING}`
    case 'atLimit': return `${site} runs as many live previews as its limit allows. Stop one of yours, or pick another site. ${NOTHING}`
    case 'guardDown': return `${site}'s guard is not running, so no live preview starts there. A fleet admin can see why on its page in the Fleet Console. ${NOTHING}`
    case 'protectionsDown': return `${site}'s network protections for live previews do not hold, so no live preview starts there. A fleet admin can see why in the Fleet Console. ${NOTHING}`
    case 'branchOpen': return `${branch} already has a live preview on ${site}. Open that one. ${NOTHING}`
    case 'noCopy': return `${site} does not hold ${branch}'s working copy. Start the live preview again, which makes a fresh one. ${NOTHING}`
    case 'noBundle': return `${branch} did not reach ${site}. Try again in a minute. ${NOTHING}`
    case 'unknownPreview': case 'stopped': return `This live preview has stopped. Start it again from Live preview. ${NOTHING}`
    case 'paused': return `This live preview is paused. Resume it first. ${NOTHING}`
    case 'notGuardPaused': return `Only a live preview the guard paused is resumed here; one paused for a lost line carries on by itself. ${NOTHING}`
    case 'noRun': return `The run that asked is not working on ${branch} on ${site}. ${NOTHING}`
    case 'appNotRunning': return `That app is not running in this live preview. Ask the agent to start it. ${NOTHING}`
    case 'serviceChanged': return `That service changed since you were asked. Look at it again. ${NOTHING}`
    case 'noPackage': return `Nothing in this live preview is waiting on that package any more. ${NOTHING}`
    case 'malformed': return `${site} could not read what HQ asked. ${NOTHING}`
  }
}

const STATUS: Record<LivePreviewRefusal['code'], number> = {
  malformed: 502, turnedOff: 409, atLimit: 409, guardDown: 503, protectionsDown: 503, branchOpen: 409, noCopy: 409,
  noBundle: 409, unknownPreview: 409, stopped: 409, paused: 409, notGuardPaused: 409, noRun: 409, appNotRunning: 409,
  serviceChanged: 409, noPackage: 409,
}

export function refusalError(r: LivePreviewRefusal, site: string, branch: string): HttpError {
  return new HttpError(STATUS[r.code] ?? 409, refusalWords(r, site, branch), { code: r.code })
}

export function siteSilent(site: string): HttpError {
  return new HttpError(503, `${site} isn't answering HQ now. Try again once it is back. ${NOTHING}`, { code: 'siteSilent' })
}

export function siteAnswerUnreadable(site: string): HttpError {
  return new HttpError(502, `${site} gave an answer HQ could not read. ${NOTHING}`)
}
