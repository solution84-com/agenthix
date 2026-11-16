/**
 * Connecting this machine to a Fleet Console and leaving it (host-management spec §6): `console connect`, `console
 * disconnect`, and HQ's `revoke`. Leaving takes effect at once and needs nobody else: the pin and the machine
 * credential are forgotten before anything else is tried, so every envelope after it is refused even when HQ and
 * the Fleet Console cannot be reached. Only then is HQ told the machine left (`leaving.ts`).
 */
import { formatFingerprint, normalizeJoinCode } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { hostKeys } from '../identity/identity'
import { joinConsole, type JoinFailure } from './join'
import { forgetPin, readPin, writePin } from './pin'
import { consoleRefusedForCloud } from './cloudController'
import { cancelAllScheduled } from '../scheduled/scheduler'
import { dialWebSocket, hqAddressProblem } from './socket'
import { siteCredentialMadeAt } from '../install/siteCompose'
import { consoleHere } from '../install/console'
import { awaitingSite, readReceive, sendOf, type ReceiveRecord } from '../move/record'
import { deliverLeaving, leaveOutcome, noteLeaving, type Post } from './leaving'
import { awaitJoinedRestore, takePrepared } from '../backups/joinedRestore'
import { refuseWhereSomethingRuns } from '../backups/restore'
import type { RestoredSite } from '../backups/siteRestore'
import { joiningAgentImage, kernelStep } from '../install/landlock'

export type ConnectResult = {
  machine: string
  consoleFingerprint: string
  hqAddress: string
  /** The site the Fleet Console started here, once it has; null when it has not yet. */
  siteName: string | null
  /** Set when a move brings something here: what, and from which machine (spec §13). */
  incoming?: { kind: 'hq' | 'site'; siteName: string; from: string; ended?: string }
  /** Set when it joined to restore a lost site from a backup (adr-0119): the site, back here. */
  restored?: RestoredSite
}

/**
 * `hq`: whether HQ heard that the machine left — `told`; `alreadyRemoved`, a fleet admin had taken it out before;
 * `notYet`, HQ did not answer and is told when it does. Null when the notice could not be kept.
 */
export type DisconnectResult = {
  machine: string
  /** The site that left HQ with the machine; null when it carried none of its own. */
  siteName: string | null
  hq: 'told' | 'alreadyRemoved' | 'notYet' | null
}

const NEW_CODE = 'Ask a fleet admin for a new one: Fleet Console → Dashboard → Add a site.'

function joinRefusal(reason: JoinFailure): Refusal {
  switch (reason) {
    case 'notAccepted':
    case 'expired':
    case 'used':
      return new Refusal('conflict', `Refused: that code has expired or was already used. ${NEW_CODE}`)
    case 'refused':
      return new Refusal('conflict', 'Refused: the fleet admin did not confirm this machine. Nothing was kept.')
    case 'badBinding':
      return new Refusal('conflict', "Refused: the answer that came back through HQ did not prove it came from the Fleet Console that made this code, so nothing was pinned or kept. Tell the fleet admin who gave you the code, and ask for a new one.")
    case 'malformed':
      return new Refusal('failed', "HQ's answer could not be read, so nothing was kept. Run this again while the code still works.")
    case 'closed':
      return new Refusal('failed', `HQ stopped answering, or no longer holds this code, before a fleet admin confirmed. Nothing was kept. ${NEW_CODE}`)
    case 'aborted':
      return new Refusal('failed', 'Stopped. Nothing was kept.')
  }
}

async function reachable(address: string): Promise<boolean> {
  try {
    await fetch(address, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    return true
  } catch {
    return false
  }
}

let joining = false

/**
 * Whether this machine runs hq, as its join says to a Fleet Console started anew (spec §7): only this host service
 * knows, having installed hq, and it never says so of an hq that has moved to another machine and only waits here to
 * be removed. The fleet admin's confirmation is what marks the machine as hq's.
 */
function runsHqHere(ctx: Context): boolean {
  if (!installed(ctx).hq) return false
  const sent = sendOf(ctx, 'hq')
  return !(sent?.phase === 'committed' || sent?.phase === 'removed')
}

export async function connectConsole(
  ctx: Context, address: string, rawCode: string, progress: (p: Progress) => void, closed?: AbortSignal,
): Promise<ConnectResult> {
  const machine = ctx.machine.name
  const hq = installed(ctx).hq
  // HQ's machine connects to the Fleet Console beside it by itself; only one elsewhere is joined this way, after
  // `hq console-code --no-machines` left the one that was lost.
  if (hq && consoleHere(ctx)?.settings.onHqMachine) throw new Refusal('conflict', `Not here: ${machine} runs HQ, and connects to its own Fleet Console by itself.`)
  const cloud = consoleRefusedForCloud(ctx.state)
  if (cloud) throw new Refusal('conflict', `Refused: ${machine} ${cloud}`)
  const pinned = readPin(ctx.state)
  if (pinned) {
    throw new Refusal('conflict', `Refused: ${machine} is already managed by a Fleet Console (its fingerprint ${formatFingerprint(pinned.consoleFingerprint)}). A machine has one controller at a time. To move it, first: ${cmd('console disconnect')}`)
  }
  const problem = hqAddressProblem(address)
  if (problem) throw new Refusal('malformed', `HQ cannot be reached at ${address}: ${problem}.`)
  const code = normalizeJoinCode(rawCode)
  if (!code) throw new Refusal('malformed', `That is not a code: a code is twelve letters and digits, as the Fleet Console shows it. ${NEW_CODE}`)
  if (joining) throw new Refusal('busy', `${machine} is already connecting to a Fleet Console. Wait for it to finish, or stop it.`)
  // Before the machine is offered to a Fleet Console, and before a restore prepared for the code is taken: a machine
  // whose kernel cannot contain agents' commands takes no site.
  await kernelStep(ctx, progress, await joiningAgentImage(ctx), 'connect')
  // A restore prepared for this code (`restore --from … <code>`): the machine joins saying which backup it restores.
  const restoring = takePrepared(ctx, code)
  if (restoring) refuseWhereSomethingRuns(ctx)
  joining = true
  try {
    progress({ event: 'step', step: `Reaching HQ at ${address}` })
    if (!(await (ctx.reach ?? reachable)(address))) {
      progress({ event: 'stepDone', outcome: 'no answer' })
      throw new Refusal('failed', `Nothing answers at ${address} from ${machine}. Check the address and this machine's network, then run this again.`)
    }
    progress({ event: 'stepDone', outcome: 'found' })
    const outcome = await joinConsole({
      address, code, keys: await hostKeys(ctx.state), machineName: machine, dial: ctx.dial ?? dialWebSocket, now: ctx.now,
      runsHq: runsHqHere(ctx),
      ...(restoring ? { restores: restoring.claim } : {}),
      onWaiting: fp => progress({ event: 'join', machine, fingerprint: formatFingerprint(fp) }),
      signal: closed,
    })
    if (!outcome.ok) throw joinRefusal(outcome.reason)
    // Enrolled with Cloud while the fleet admin confirmed: Cloud keeps the machine.
    const cloudNow = consoleRefusedForCloud(ctx.state)
    if (cloudNow) throw new Refusal('conflict', `Refused: ${machine} ${cloudNow} Nothing was pinned.`)
    // Armed before the link starts, so the Fleet Console's ask cannot arrive before it.
    const restored = restoring && awaitJoinedRestore(restoring, outcome.pin.consoleFingerprint, progress, ctx.waits.siteMs, closed)
    writePin(ctx.state, { ...outcome.pin, local: false })
    ctx.link?.start()
    progress({ event: 'joined', machine, consoleFingerprint: formatFingerprint(outcome.pin.consoleFingerprint), hqAddress: address })
    if (restored) {
      progress({ event: 'note', text: `Confirmed. The Fleet Console now asks for ${restoring.claim.siteName}; the restore begins here when it does.` })
      return { machine, consoleFingerprint: outcome.pin.consoleFingerprint, hqAddress: address, siteName: null, restored: await restored }
    }
    if (hq) {
      // HQ's own site runs already: the Fleet Console starts none here.
      return { machine, consoleFingerprint: outcome.pin.consoleFingerprint, hqAddress: address, siteName: installed(ctx).site?.settings.name ?? null }
    }
    const taken = await waitForSite(ctx, outcome.pin.pinnedAt, progress)
    return { machine, consoleFingerprint: outcome.pin.consoleFingerprint, hqAddress: address, ...taken }
  } finally {
    joining = false
  }
}

/**
 * Step 5: the Fleet Console asks for the site as soon as it pinned this machine, either a new one or, for a move, the
 * one that comes from another machine (or HQ and its site). Which one shows in the move record it arms first, so the
 * step is named after that.
 */
async function waitForSite(ctx: Context, since: string, progress: (p: Progress) => void): Promise<Pick<ConnectResult, 'siteName' | 'incoming'>> {
  const until = ctx.now().getTime() + ctx.waits.siteMs
  let move = incomingSince(ctx, since)
  if (!move && !siteCredentialMadeAt(ctx.state)) {
    await ctx.sleep(ctx.waits.pollMs)
    move = incomingSince(ctx, since)
  }
  const incoming = move && { kind: move.target === 'hq' ? 'hq' as const : 'site' as const, siteName: move.siteName, from: move.peerName }
  const step = incoming?.kind === 'hq' ? `Receiving HQ and its site ${incoming.siteName} from ${incoming.from}` : incoming ? `Receiving the site ${incoming.siteName} from ${incoming.from}` : `Starting the site ${ctx.machine.name}`
  progress({ event: 'step', step })
  for (;;) {
    // The move ended before anything of it arrived — refused on the other machine, or cancelled: it did not happen.
    const now = move && readReceive(ctx.state)
    if (incoming && now?.transferId === move?.transferId && now?.phase === 'failed') {
      progress({ event: 'stepDone', outcome: 'did not happen' })
      return { siteName: null, incoming: { ...incoming, ended: now.reason ?? 'the move ended before it began.' } }
    }
    if (incoming?.kind === 'hq') {
      progress({ event: 'stepDone', outcome: 'under way' })
      return { siteName: null, incoming }
    }
    const made = siteCredentialMadeAt(ctx.state)
    const site = installed(ctx).site
    if (site && made && made >= since) {
      progress({ event: 'stepDone', outcome: 'running' })
      return { siteName: site.settings.name, ...(incoming ? { incoming } : {}) }
    }
    if (ctx.now().getTime() >= until) {
      progress({ event: 'stepDone', outcome: 'not yet' })
      return { siteName: null, ...(incoming ? { incoming } : {}) }
    }
    await ctx.sleep(ctx.waits.pollMs)
  }
}

/** The move armed here since this machine was pinned: under way, or one that ended — failed — before it came. */
function incomingSince(ctx: Context, since: string): ReceiveRecord | null {
  const waiting = awaitingSite(ctx.state)
  if (waiting) return waiting
  const r = readReceive(ctx.state)
  return r?.phase === 'failed' && Date.parse(r.armedAt) >= Date.parse(since) ? r : null
}

/**
 * Forgets the Fleet Console, closes the link and stops the site it added; HQ's default site is not its to stop. What
 * was scheduled on the machine ends first, so the Fleet Console can still be told while it is pinned.
 */
export async function forgetConsole(ctx: Context): Promise<{ siteName: string | null }> {
  await cancelAllScheduled(ctx, `${ctx.machine.name} was disconnected from its Fleet Console`).catch(() => {})
  forgetPin(ctx.state)
  ctx.link?.stop()
  const site = installed(ctx).site
  if (!site?.settings.hqUrl) return { siteName: null }
  await ctx.docker.composeStop(site.project, site.file).catch(() => {})
  return { siteName: site.settings.name }
}

/**
 * The pin goes first; only then is HQ told the machine left, at once if it answers, at the address the pin held
 * (`leaving.ts`).
 */
export async function disconnectConsole(ctx: Context, post?: Post): Promise<DisconnectResult> {
  const machine = ctx.machine.name
  if (installed(ctx).hq) {
    throw new Refusal('conflict', `Not here: ${machine} is where HQ runs, with its site, so it cannot leave. To remove everything from this machine: ${cmd('hq erase')}`)
  }
  const pin = readPin(ctx.state)
  if (!pin) throw new Refusal('not_found', `${machine} is not managed by a Fleet Console: there is nothing to disconnect.`)
  const { siteName } = await forgetConsole(ctx)
  const notice = await noteLeaving(ctx, pin)
  if (!notice) return { machine, siteName, hq: null }
  // A site whose credential a move gave to another machine stopped here, but does not leave HQ with this machine.
  return { machine, siteName: notice.site?.name ?? null, hq: leaveOutcome(await deliverLeaving(ctx.state, post)) }
}
