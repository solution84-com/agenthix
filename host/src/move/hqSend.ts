/**
 * The old machine's side of *Move HQ…* to a new machine (spec §13), run as a scheduled change on hq's machine, so hq
 * hears it through its control socket and pauses runs around it (§14). In order:
 *
 * 1. hq tells its sites, host services and the Fleet Console its new address, when it changes, and everyone in hq.
 * 2. hq turns read-only: people can read but not change anything from the moment the move's backup starts. The Fleet
 *    Console, when it runs here, stops, so what it holds is in the backup as it stands; the site stops.
 * 3. The backup of hq, its site and the Fleet Console here is re-wrapped to the new machine's key and passed to it in
 *    signed chunks, as a site's move does (chunks.ts).
 * 4. When the new machine has it restored and stopped, the release goes to it — through this hq, the last thing it
 *    passes — and hq stops here at once. This machine's link then dials hq's new address, where the new machine opens
 *    the move's last steps (hqReceive.ts).
 * 5. When the new machine says hq answers there, this machine commits — never to start hq again — and keeps saying so
 *    until the new machine's deadline. The copy left here goes later, as the move's last step (`removeMovedHq`).
 *
 * Anything short of the commit puts hq back here, writable, where it was: at once while hq still runs here, otherwise
 * once the new machine's deadline has surely passed (timings.ts), since its word that it stopped cannot cross an hq
 * that no longer runs.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { MoveRequest, ScheduledChange } from '@agenthix/core'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { hostKeys } from '../identity/identity'
import { machineHolder } from '../backups/keys'
import { rewrapBackup } from '../backups/seal'
import { BackupStore } from '../backups/store'
import { exclusiveWhenFree, takeBackup, type OnWait } from '../backups/take'
import { readStore } from '../scheduled/store'
import { frontDoorSettings } from '../frontDoor/frontDoor'
import { addressProblem } from '../install/address'
import { readPin } from '../link/pin'
import { PeerChannel } from './peer'
import { readSend, sendOf, writeSend, type SendRecord } from './record'
import { sendChunks } from './chunks'
import { commitBy, releaseDeadline, timingsOf } from './timings'
import { wireOf } from './wire'
import { report } from './report'
import { clearHq } from './restoreHq'
import {
  hqAnswersBy, hqSays, keepReadOnly, pinNow, pointPin, startHqAndSite, startConsoleHere, stopHqAndSite, stopConsoleHere, type ReadOnlyKept,
} from './hqSteps'

type SendRequest = Extract<MoveRequest, { role: 'send' }>

export function hqSendCheck(ctx: Context, r: SendRequest): void {
  const { hq, site } = installed(ctx)
  if (!hq || !site) throw new Refusal('not_installed', `No HQ here: ${ctx.machine.name} runs no HQ to move.`)
  if (!readPin(ctx.state) || !wireOf(ctx)) throw new Refusal('failed', `${ctx.machine.name} is not connected to the Fleet Console that moves HQ.`)
  const problem = r.hqAddress ? addressProblem(r.hqAddress) : null
  if (problem) throw new Refusal('malformed', `HQ cannot be at ${r.hqAddress}: ${problem}.`)
  if (frontDoorSettings(ctx)?.on) {
    throw new Refusal('conflict', `The front door serves HQ on ${ctx.machine.name}. Turn it off first, move HQ, then turn it on at the new machine.`)
  }
  const before = sendOf(ctx, 'hq')
  if (before?.phase === 'committed' || before?.phase === 'removed') throw new Refusal('conflict', `HQ has moved from ${ctx.machine.name} already.`)
}

function changeOf(ctx: Context, transferId: string): ScheduledChange {
  const entry = readStore(ctx.state).entries.find(e => e.request.op === 'move' && e.request.transferId === transferId && !e.endedAt)
  if (!entry) throw new Refusal('failed', 'A move runs only as a scheduled change.')
  return entry.change
}

async function untilTime(ctx: Context, at: number): Promise<void> {
  while (ctx.now().getTime() < at) await ctx.sleep(Math.min(at - ctx.now().getTime(), 60_000))
}

export function runHqMoveSend(ctx: Context, r: SendRequest, waiting: OnWait = () => {}): Promise<void> {
  return exclusiveWhenFree(ctx, 'move', async () => {
    hqSendCheck(ctx, r)
    const keys = await hostKeys(ctx.state)
    const own = await fingerprintOf(keys.identity)
    if ((await fingerprintOf(r.peerIdentity)) !== r.peer || r.peer === own) throw new Refusal('malformed', 'The machine to move to is not named as it was pinned.')
    const prior = readSend(ctx.state)
    if (prior?.transferId === r.transferId) return resumeHq(ctx, prior)
    const change = changeOf(ctx, r.transferId)
    const t = timingsOf(ctx)
    const previousAddress = installed(ctx).hq!.settings.address
    const hqAddress = r.hqAddress ?? previousAddress
    const channel = new PeerChannel(ctx, r.transferId, keys, own, r.peer, r.peerIdentity).start()
    let record: SendRecord = {
      transferId: r.transferId, peer: r.peer, peerIdentity: r.peerIdentity, phase: 'stopped', releasedAt: null, deadline: null, reason: null,
      target: 'hq', hqAddress, previousAddress, pinBefore: pinNow(ctx), consoleWithHq: false, peerName: r.peerName,
      installedAt: installed(ctx).hq!.settings.installedAt,
    }
    const save = (patch: Partial<SendRecord>) => {
      record = { ...record, ...patch }
      writeSend(ctx.state, record)
    }
    let committed = false
    let readOnlyKept: ReadOnlyKept | null = null
    try {
      await report(ctx, r.transferId, 'started')
      if (hqAddress !== previousAddress) {
        const told = await hqSays(ctx, 'address-move', [hqAddress])
        if (!told?.ok) throw new Refusal('failed', told ? `HQ refused to tell its sites the new address: ${told.error}` : 'HQ did not answer, so it could tell no one its new address.')
      }
      // Written down before hq turns read-only, so a restart puts it back.
      save({ phase: 'stopped' })
      const readOnly = await hqSays(ctx, 'read-only', ['on', r.peerName])
      if (!readOnly?.ok) throw new Refusal('failed', 'HQ did not turn read-only, so nothing was moved.')
      // Until the move ends, an hq that starts again here is read-only again: even past the release, when it should not run.
      readOnlyKept = keepReadOnly(ctx, r.peerName, t.pollMs)
      save({ consoleWithHq: await stopConsoleHere(ctx) })
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

      const sentAt = ctx.now().getTime()
      save({ phase: 'released', releasedAt: sentAt, deadline: releaseDeadline(sentAt, t) })
      // hq has no site credential to hand over: the step carries a value the new machine does not use.
      await channel.send({ step: 'released', credential: crypto.randomBytes(32).toString('hex'), change, takeoverMs: t.takeoverMs })
      await stopHqAndSite(ctx)
      // The last steps cross hq where it runs next; what the hq stopped here says of the transfer no longer counts.
      channel.outlastHq()
      pointPin(ctx, { hqAddress, local: false })
      const answer = await channel.nextStep(commitBy(sentAt, t), s => s.step === 'tookOver' || s.step === 'gaveBack' || s.step === 'failed')
      if (answer?.step !== 'tookOver') throw new Refusal('failed', answer && 'reason' in answer ? answer.reason : `HQ did not take over on ${r.peerName} in time.`)
      save({ phase: 'committed' })
      committed = true
      await readOnlyKept.stop()
      await channel.send({ step: 'committed' })
      await report(ctx, r.transferId, 'committed')
      void keepCommitting(ctx, channel, record.deadline!)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      if (record.phase === 'released' && record.deadline) await untilTime(ctx, record.deadline)
      await readOnlyKept?.stop()
      await rollbackHq(ctx, record, reason)
      await channel.send({ step: 'abort', reason: reason.slice(0, 400) }).catch(() => false)
      save({ phase: 'rolledBack', reason })
      throw err instanceof Refusal ? err : new Refusal('failed', reason)
    } finally {
      await readOnlyKept?.stop()
      if (!committed) channel.stop()
    }
  }, waiting)
}

async function untilReady(ctx: Context, channel: PeerChannel, idleMs: number, peerName: string): Promise<void> {
  for (;;) {
    const step = await channel.nextStep(channel.lastHeard + idleMs, s => s.step === 'restoring' || s.step === 'ready' || s.step === 'failed')
    if (!step) {
      if (!channel.closed && ctx.now().getTime() < channel.lastHeard + idleMs) continue
      throw new Refusal('failed', channel.closed ? `HQ stopped passing the backup to ${peerName}.` : `${peerName} stopped answering while it restored HQ.`)
    }
    if (step.step === 'ready') return
    if (step.step === 'failed') throw new Refusal('failed', step.reason)
  }
}

/** The commit may be lost on the way: each `tookOver` that comes again, until the new machine's deadline, is answered. */
async function keepCommitting(ctx: Context, channel: PeerChannel, until: number): Promise<void> {
  const t = timingsOf(ctx)
  try {
    while (ctx.now().getTime() < until) {
      const again = await channel.nextStep(ctx.now().getTime(), s => s.step === 'tookOver')
      if (again) await channel.send({ step: 'committed' }).catch(() => false)
      await ctx.sleep(t.pollMs)
    }
  } finally {
    channel.stop()
  }
}

/**
 * hq writable here again, where it was: its site, the Fleet Console beside it, and those told the new address.
 * `stopped`: hq was stopped here, at the release, and starts again; otherwise it still runs, read-only.
 */
export async function rollbackHq(ctx: Context, record: SendRecord, reason: string, stopped = record.phase === 'released'): Promise<void> {
  if (record.pinBefore) pointPin(ctx, record.pinBefore)
  if (stopped) await startHqAndSite(ctx).catch(() => {})
  else {
    await hqSays(ctx, 'read-only', ['off'])
    const site = installed(ctx).site
    if (site) await ctx.docker.composeUp(site.project, site.file).catch(() => {})
  }
  if (record.consoleWithHq) await startConsoleHere(ctx).catch(() => {})
  if (record.previousAddress && record.hqAddress !== record.previousAddress) {
    // Told hq's own address, those it told stop waiting for the new one.
    if (await hqAnswersBy(ctx, ctx.now().getTime() + ctx.waits.hqMs, ctx.waits.pollMs)) await hqSays(ctx, 'address-move', [record.previousAddress])
  }
  await report(ctx, record.transferId, 'rolledBack', reason)
}

/** After a restart in the middle: a commit stands; a release waits out its deadline; anything before is put back. */
async function resumeHq(ctx: Context, prior: SendRecord): Promise<void> {
  if (prior.phase === 'committed' || prior.phase === 'removed') return
  if (prior.phase === 'released' && prior.deadline) await untilTime(ctx, prior.deadline)
  const reason = 'the host service restarted during the move.'
  if (prior.phase !== 'rolledBack') await rollbackHq(ctx, prior, reason)
  writeSend(ctx.state, { ...prior, phase: 'rolledBack', reason })
  throw new Refusal('failed', reason)
}

/** The move's last step: the copy of hq, its site and the Fleet Console left here, once hq answers from the new machine. */
export async function removeMovedHq(ctx: Context): Promise<{ state: 'removed' }> {
  const record = readSend(ctx.state)
  // A commit counts only for the HQ that runs here now; once removed, asking again is answered as done.
  const ofThisHq = record?.phase === 'committed' && sendOf(ctx, 'hq') !== null
  if (record?.target !== 'hq' || !(ofThisHq || record.phase === 'removed')) {
    throw new Refusal('conflict', `HQ on ${ctx.machine.name} is removed here only once it has moved to another machine, and it has not.`)
  }
  if (record.phase === 'removed') return { state: 'removed' }
  await clearHq(ctx)
  // Nothing of hq's is kept but its backups, sealed to this machine.
  fs.rmSync(ctx.state.path('secrets.json'), { force: true })
  writeSend(ctx.state, { ...record, phase: 'removed' })
  await report(ctx, record.transferId, 'removed')
  return { state: 'removed' }
}
