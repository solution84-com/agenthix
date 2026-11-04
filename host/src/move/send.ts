/**
 * The old machine's side of a site's move (spec §13 *A site moves*, steps 3–5), run as a scheduled change so members
 * are told and runs pause around it (§14). In order:
 *
 * 1. Once hq has heard the change started, the site stops: it is read-only from the moment the final backup starts,
 *    so nothing is lost between the backup and the switch.
 * 2. The final backup, sealed to this machine, is re-wrapped to the new machine's sealing key and passed to it in
 *    signed chunks (chunks.ts).
 * 3. When the new machine has it restored, and stopped, the site's credential goes to it (`released`).
 * 4. When the new machine says the site answers hq from there, this machine commits — writes down that it never
 *    starts the site again — and tells it so. The copy kept here is removed later, as the move's last step, when the
 *    Fleet Console asks (`removeMovedSite`).
 *
 * Anything short of the commit puts the site back here, as it was: at once if the credential never left, otherwise
 * once the new machine has said it gave the site back, or its deadline has surely passed (timings.ts).
 */
import type { MoveRequest, ScheduledChange } from '@agenthix/core'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { hostKeys } from '../identity/identity'
import { readSiteCredential } from '../install/siteCompose'
import { machineHolder } from '../backups/keys'
import { rewrapBackup } from '../backups/seal'
import { BackupStore } from '../backups/store'
import { exclusiveWhenFree, takeBackup, type OnWait } from '../backups/take'
import { readStore } from '../scheduled/store'
import { waitForSiteToTellHq } from '../lifecycle/siteTold'
import { PeerChannel } from './peer'
import { readSend, sendOf, writeSend, type SendRecord } from './record'
import { sendChunks } from './chunks'
import { commitBy, releaseDeadline, timingsOf } from './timings'
import { wireOf } from './wire'
import { report } from './report'

export type SendRequest = Extract<MoveRequest, { role: 'send' }>

/** What could not run as asked, in words; when it is scheduled, and again at its time. */
export function sendCheck(ctx: Context, r: SendRequest): void {
  if (r.target !== 'site') throw new Refusal('failed', 'This version of the host service cannot schedule that yet: HQ moves with Move HQ….')
  const { hq, site } = installed(ctx)
  if (hq) throw new Refusal('conflict', "HQ's own site moves with HQ, with Move HQ….")
  if (!site) throw new Refusal('not_installed', `No site runs on ${ctx.machine.name}, so there is nothing to move.`)
  if (!readSiteCredential(ctx.state)) throw new Refusal('conflict', `The site on ${ctx.machine.name} was not added by a Fleet Console, so it has no credential of its own to take with it.`)
  if (!wireOf(ctx)) throw new Refusal('failed', `${ctx.machine.name} has no link to HQ to move the site over.`)
  // Only a move of this very site guards it: one of HQ, or of a site installed here before, ended with what it moved.
  const before = sendOf(ctx, 'site')
  if (before?.phase === 'committed' || before?.phase === 'removed') throw new Refusal('conflict', `The site on ${ctx.machine.name} has moved already.`)
  if (before?.phase === 'released' && before.deadline && ctx.now().getTime() < before.deadline) {
    throw new Refusal('conflict', `The site on ${ctx.machine.name} may still be taking over on another machine, until ${new Date(before.deadline).toISOString()}.`)
  }
}

/** The change this move runs as, which the new machine's site passes on to hq as completed. */
function changeOf(ctx: Context, transferId: string): ScheduledChange {
  const entry = readStore(ctx.state).entries.find(e => e.request.op === 'move' && e.request.transferId === transferId && !e.endedAt)
  if (!entry) throw new Refusal('failed', 'A move runs only as a scheduled change.')
  return entry.change
}

export function runMoveSend(ctx: Context, r: SendRequest, waiting: OnWait = () => {}): Promise<void> {
  return exclusiveWhenFree(ctx, 'move', async () => {
    sendCheck(ctx, r)
    const keys = await hostKeys(ctx.state)
    const own = await fingerprintOf(keys.identity)
    if ((await fingerprintOf(r.peerIdentity)) !== r.peer || r.peer === own) throw new Refusal('malformed', 'The machine to move to is not named as it was pinned.')
    const prior = readSend(ctx.state)
    if (prior?.transferId === r.transferId) return resume(ctx, prior)
    const change = changeOf(ctx, r.transferId)
    const t = timingsOf(ctx)
    const channel = new PeerChannel(ctx, r.transferId, keys, own, r.peer, r.peerIdentity).start()
    let record: SendRecord = {
      transferId: r.transferId, peer: r.peer, peerIdentity: r.peerIdentity, phase: 'stopped', releasedAt: null, deadline: null, reason: null,
      target: 'site', installedAt: installed(ctx).site!.settings.installedAt,
    }
    const save = (patch: Partial<SendRecord>) => {
      record = { ...record, ...patch }
      writeSend(ctx.state, record)
    }
    let committed = false
    try {
      await report(ctx, r.transferId, 'started')
      // The change's `started` notice reaches hq through the site, which then pauses runs; best effort, as erase does.
      await waitForSiteToTellHq(ctx, new Date(ctx.now().getTime() - 1000)).catch(() => false)
      save({ phase: 'stopped' })
      const site = installed(ctx).site!
      await ctx.docker.composeStop(site.project, site.file)
      await ctx.backupIO.startServices(site.project, site.file, ['site-db'])
      const taken = await takeBackup(ctx, 'now')
      const store = new BackupStore(ctx.state)
      const found = await store.find(taken.id)
      if (!found) throw new Refusal('failed', 'the final backup was not where it was written.')
      const { bytes } = await rewrapBackup(store.bytes(found.name), machineHolder(ctx.state), Buffer.from(r.peerIdentity.sealingKey, 'base64url'))
      save({ phase: 'transferring' })
      await report(ctx, r.transferId, 'transferring')
      await sendChunks(ctx, channel, bytes, t)
      await untilReady(ctx, channel, t.idleMs, r.peerName)

      const credential = readSiteCredential(ctx.state)!
      const sentAt = ctx.now().getTime()
      // Written down before the credential leaves: from here on, the site starts here again only past the deadline.
      save({ phase: 'released', releasedAt: sentAt, deadline: releaseDeadline(sentAt, t) })
      await channel.send({ step: 'released', credential, change, takeoverMs: t.takeoverMs })
      const answer = await channel.nextStep(commitBy(sentAt, t), s => s.step === 'tookOver' || s.step === 'gaveBack' || s.step === 'failed')
      if (answer?.step === 'tookOver') {
        save({ phase: 'committed' })
        committed = true
        await channel.send({ step: 'committed' })
        await report(ctx, r.transferId, 'committed')
        return
      }
      const said = answer ?? await channel.nextStep(record.deadline!, s => s.step === 'gaveBack' || s.step === 'failed')
      // The new machine's word that it stopped lets the site start here at once; without it, the deadline must pass.
      if (said) save({ deadline: null })
      throw new Refusal('failed', said && 'reason' in said ? said.reason : `the site did not take over on ${r.peerName} in time.`)
    } catch (err) {
      // The new machine has the site: whatever failed after the commit was written down does not start it here again.
      if (committed) throw err
      const reason = err instanceof Error ? err.message : String(err)
      // Whatever went wrong, once the credential left, the new machine's deadline passes before the site starts here.
      if (record.phase === 'released' && record.deadline) await untilTime(ctx, record.deadline)
      await rollback(ctx, channel, r.transferId, reason)
      save({ phase: 'rolledBack', reason })
      throw err instanceof Refusal ? err : new Refusal('failed', reason)
    } finally {
      channel.stop()
    }
  }, waiting)
}

/** The new machine has the backup restored: it says it is still at it as it goes, and the move ends if it falls silent. */
async function untilReady(ctx: Context, channel: PeerChannel, idleMs: number, peerName: string): Promise<void> {
  for (;;) {
    const step = await channel.nextStep(channel.lastHeard + idleMs, s => s.step === 'restoring' || s.step === 'ready' || s.step === 'failed')
    if (!step) {
      if (!channel.closed && ctx.now().getTime() < channel.lastHeard + idleMs) continue
      throw new Refusal('failed', channel.closed ? `HQ stopped passing the backup to ${peerName}.` : `${peerName} stopped answering while it restored the site.`)
    }
    if (step.step === 'ready') return
    if (step.step === 'failed') throw new Refusal('failed', step.reason)
  }
}

async function untilTime(ctx: Context, at: number): Promise<void> {
  while (ctx.now().getTime() < at) await ctx.sleep(Math.min(at - ctx.now().getTime(), 60_000))
}

/** The site starts here again, as it was; the new machine is told to clear what it has. */
async function rollback(ctx: Context, channel: PeerChannel, transferId: string, reason: string): Promise<void> {
  const site = installed(ctx).site
  if (site) await ctx.docker.composeUp(site.project, site.file)
  await channel.send({ step: 'abort', reason: reason.slice(0, 400) }).catch(() => false)
  await report(ctx, transferId, 'rolledBack', reason)
}

/**
 * The scheduler runs a change again when the host service restarted during it. A commit stands; a credential that left
 * waits out its deadline; anything before puts the site back here at once.
 */
async function resume(ctx: Context, prior: SendRecord): Promise<void> {
  if (prior.phase === 'committed' || prior.phase === 'removed') return
  if (prior.phase === 'released' && prior.deadline) await untilTime(ctx, prior.deadline)
  const reason = 'the host service restarted during the move.'
  const site = installed(ctx).site
  if (site && prior.phase !== 'rolledBack') await ctx.docker.composeUp(site.project, site.file)
  writeSend(ctx.state, { ...prior, phase: 'rolledBack', reason })
  await report(ctx, prior.transferId, 'rolledBack', reason)
  throw new Refusal('failed', reason)
}
