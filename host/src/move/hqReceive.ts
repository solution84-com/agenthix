/**
 * The new machine's side of *Move HQ…* (spec §13). Armed by the Fleet Console's signed request naming the old machine,
 * it waits and starts nothing of its own; takes the sealed backup in, each chunk checked against the old machine's
 * key; restores hq, its site and the Fleet Console that ran beside them, stopped (restoreHq.ts); and says it is ready.
 *
 * On the release, the old machine stops its hq. This one waits as long as that may take — the old machine's word
 * that it could not stop still reaches it then — and only then starts hq and its site, read-only until the move is
 * settled. Its link now dials hq here, where it opens the move's last steps between the two machines. Once hq answers
 * here it says `tookOver`, again and again, until the old machine commits by the deadline (timings.ts); then hq is
 * writable, the Fleet Console starts if it came with hq, and the change is passed to hq as completed. Otherwise
 * everything of hq here is cleared, those that followed hq here are pointed back, and the machine is as it was.
 */
import fs from 'node:fs'
import type { MoveRequest, ScheduledChange } from '@agenthix/core'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { hostKeys } from '../identity/identity'
import type { ConsolePin } from '../link/pin'
import { localHqAddress, consoleHere } from '../install/console'
import { refuseUnpublishable } from './ports'
import { withStore } from '../scheduled/store'
import { deliverNotices } from '../scheduled/notices'
import { PeerChannel } from './peer'
import { readReceive, receiving, writeReceive, type ReceiveRecord } from './record'
import { clearHq, restoreMovedHq } from './restoreHq'
import { hqPortOf } from '../compose/projects'
import { installationOf } from '../state/installation'
import { takeIn } from './receive'
import { takeoverDeadlines, timingsOf } from './timings'
import { report } from './report'
import { hqAnswersBy, hqSays, keepReadOnly, pinNow, pointPin, startHqAndSite, startConsoleHere, type ReadOnlyKept } from './hqSteps'

type ReceiveRequest = Extract<MoveRequest, { role: 'receive' }>

/** How many times the new machine repeats that hq took over, for a Fleet Console that comes up after it (with hq). */
const REPORT_REPEATS = 20

class Failed extends Error {}

export async function armHqReceive(ctx: Context, r: ReceiveRequest, pin: ConsolePin): Promise<{ transferId: string }> {
  const here = installed(ctx)
  if (here.hq || here.site || consoleHere(ctx) || pin.local) throw new Refusal('conflict', `${ctx.machine.name} already runs something; HQ moves only to a machine that runs nothing.`)
  refuseUnpublishable(r)
  const own = await fingerprintOf((await hostKeys(ctx.state)).identity)
  if ((await fingerprintOf(r.peerIdentity)) !== r.peer || r.peer === own) throw new Refusal('malformed', 'The machine HQ comes from is not named as it was pinned.')
  const before = readReceive(ctx.state)
  if (before && before.transferId !== r.transferId && before.phase !== 'waiting' && before.phase !== 'failed' && before.phase !== 'committed') {
    throw new Refusal('busy', `${ctx.machine.name} is taking in the site ${before.siteName} now.`)
  }
  if (!before || before.transferId !== r.transferId || before.phase === 'waiting') {
    writeReceive(ctx.state, {
      transferId: r.transferId, peer: r.peer, peerIdentity: r.peerIdentity, peerName: r.peerName, siteName: r.siteName,
      phase: 'waiting', armedAt: ctx.now().toISOString(), deadline: null, reason: null, target: 'hq', ...(r.hqAddress ? { hqAddress: r.hqAddress } : {}),
      ...(r.hqPort !== undefined || r.consolePort !== undefined ? { ports: { hqPort: r.hqPort, consolePort: r.consolePort } } : {}),
    })
  }
  return { transferId: r.transferId }
}

export async function runHqReceive(ctx: Context, armed: ReceiveRecord, first: Record<string, unknown>): Promise<void> {
  receiving.add(ctx.state.root)
  const keys = await hostKeys(ctx.state)
  const own = await fingerprintOf(keys.identity)
  const t = timingsOf(ctx)
  const channel = new PeerChannel(ctx, armed.transferId, keys, own, armed.peer, armed.peerIdentity).start()
  let record: ReceiveRecord = { ...armed, pinBefore: pinNow(ctx) }
  const save = (patch: Partial<ReceiveRecord>) => {
    record = { ...record, ...patch }
    writeReceive(ctx.state, record)
  }
  const file = ctx.state.path('move', 'incoming.part')
  ctx.state.folder('move')
  const timers: ReturnType<typeof setInterval>[] = []
  let readOnlyKept: ReadOnlyKept | null = null
  const every = (ms: number, work: () => void) => {
    const timer = setInterval(work, ms)
    timers.push(timer)
    return timer
  }
  try {
    save({ phase: 'receiving' })
    await takeIn(ctx, channel, file, first, t.idleMs)
    save({ phase: 'restored' })
    await report(ctx, armed.transferId, 'restoring')
    const heartbeat = every(t.heartbeatMs, () => void channel.send({ step: 'restoring' }).catch(() => false))
    await channel.send({ step: 'restoring' })
    const restored = await restoreMovedHq(ctx, file, keys, armed.hqAddress ?? null, armed.ports ?? {})
    save({ hqAddress: restored.address, previousAddress: restored.previousAddress, consoleWithHq: restored.consoleWithHq })
    clearInterval(heartbeat)
    fs.rmSync(file, { force: true })
    await channel.send({ step: 'ready' })

    const release = await channel.nextStep(ctx.now().getTime() + t.idleMs, s => s.step === 'released' || s.step === 'abort')
    if (!release || release.step !== 'released') throw new Failed(release && 'reason' in release ? release.reason : 'the old machine did not hand HQ over.')
    const { answerBy, commitBy } = takeoverDeadlines(ctx.now().getTime(), t)
    save({ phase: 'starting', deadline: commitBy })
    // The old machine stops its hq as it sends the release: hq starts here only once that has surely happened.
    await ctx.sleep(t.stopMs)
    const abort = await channel.nextStep(ctx.now().getTime(), s => s.step === 'abort')
    if (abort && 'reason' in abort) throw new Failed(abort.reason)
    channel.outlastHq()
    pointPin(ctx, { hqAddress: localHqAddress(hqPortOf(installationOf(ctx.state))), local: restored.consoleWithHq })
    // Read-only from the moment hq answers here, and again whenever it starts anew, until the old machine commits.
    readOnlyKept = keepReadOnly(ctx, ctx.machine.name, t.pollMs)
    await startHqAndSite(ctx)
    if (!(await hqAnswersBy(ctx, answerBy, t.pollMs))) throw new Failed(`HQ did not answer on ${ctx.machine.name} in time.`)
    // Read-only until the old machine commits, so nothing is written here that giving HQ back would lose.
    await hqSays(ctx, 'read-only', ['on', ctx.machine.name])
    const opened = await hqSays(ctx, 'transfer-open', [armed.transferId, armed.peer, own])
    if (!opened?.ok) throw new Failed('HQ here would not pass the last steps of the move.')
    save({ phase: 'tookOver' })
    const saying = every(Math.max(t.pollMs, 1), () => void channel.send({ step: 'tookOver' }).catch(() => false))
    await channel.send({ step: 'tookOver' })
    const commit = await channel.nextStep(commitBy, s => s.step === 'committed' || s.step === 'abort')
    clearInterval(saying)
    if (commit?.step !== 'committed') throw new Failed(commit && 'reason' in commit ? commit.reason : 'the old machine did not confirm the move in time.')
    save({ phase: 'committed', deadline: null })
    await readOnlyKept.stop()
    await hqSays(ctx, 'read-only', ['off'])
    if (restored.consoleWithHq) await startConsoleHere(ctx)
    await noteCompleted(ctx, release.change, record)
    await report(ctx, armed.transferId, 'tookOver')
    let told = 1
    const repeat = setInterval(() => {
      if (++told > REPORT_REPEATS) return clearInterval(repeat)
      void report(ctx, armed.transferId, 'tookOver')
    }, t.heartbeatMs)
    repeat.unref?.()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await readOnlyKept?.stop()
    const started = record.phase === 'starting' || record.phase === 'tookOver'
    let stopped = true
    if (started) {
      // Those that followed hq here go back to where it runs again.
      if (record.previousAddress && record.previousAddress !== record.hqAddress) await hqSays(ctx, 'address-move', [record.previousAddress])
      const here = installed(ctx)
      for (const p of [here.site, here.hq]) if (p) await ctx.docker.composeStop(p.project, p.file).catch(() => { stopped = false })
    }
    await clearHq(ctx)
    if (record.pinBefore) pointPin(ctx, record.pinBefore)
    save({ phase: 'failed', deadline: null, reason })
    // Before the release, the old hq still passes this; after it, nothing does, and the old machine waits its deadline.
    if (stopped) await channel.send(started ? { step: 'gaveBack', reason: reason.slice(0, 400) } : { step: 'failed', reason: reason.slice(0, 400) }).catch(() => false)
    await report(ctx, armed.transferId, 'failed', reason)
  } finally {
    await readOnlyKept?.stop()
    for (const timer of timers) clearInterval(timer)
    fs.rmSync(file, { force: true })
    channel.stop()
    receiving.delete(ctx.state.root)
  }
}

/** The move's change, as completed, for hq here to hear through its control socket and resume the paused runs. */
async function noteCompleted(ctx: Context, change: ScheduledChange, r: ReceiveRecord): Promise<void> {
  const now = ctx.now()
  const request: ReceiveRequest = {
    op: 'move', role: 'receive', target: 'hq', peer: r.peer, peerIdentity: r.peerIdentity, peerName: r.peerName, transferId: r.transferId, siteName: r.siteName,
  }
  await withStore(ctx.state, file => {
    file.nextId = Math.max(file.nextId, Number(change.id) + 1 || file.nextId)
    const done: ScheduledChange = { ...change, state: 'done' }
    file.entries.push({
      change: done, request, notice: { update: 'completed', change: done, sentAt: now.toISOString(), reason: null }, delivered: false, endedAt: now.toISOString(),
    })
  })
  await deliverNotices(ctx).catch(() => {})
}

/** At start: hq taken in here but never committed did not move; nothing of it stays, and the pin is as it was. */
export async function settleHqAfterRestart(ctx: Context, record: ReceiveRecord): Promise<void> {
  await clearHq(ctx)
  if (record.pinBefore) pointPin(ctx, record.pinBefore)
  fs.rmSync(ctx.state.path('move', 'incoming.part'), { force: true })
  writeReceive(ctx.state, { ...record, phase: 'failed', deadline: null, reason: 'the host service restarted during the move.' })
}
