/**
 * The new machine's side of a site's move (spec §13 *A site moves*, steps 2 and 4). The Fleet Console arms it with a
 * signed `move` request naming the old machine; from then on it waits, and starts no site of its own. When the old
 * machine's first chunk comes, it takes the sealed backup in — each chunk checked against the old machine's key, in
 * order, or the whole move ends with nothing kept — restores it stopped, and says it is ready. The site starts only
 * when the old machine releases it with its credential, and stays only if it answers hq and the old machine commits
 * before the deadline (timings.ts); otherwise everything of it here is cleared and the old machine told. If the site's
 * container exits or cannot start meanwhile, it gives up at once rather than at the deadline, so the old machine can
 * start the site again within seconds. Until the move ends it keeps saying it is at work (`restoring`), so hq, which
 * drops a transfer that falls silent, keeps passing the steps between the two machines.
 */
import fs from 'node:fs'
import { parseTransferChunk, type MoveRequest, type ScheduledChange } from '@agenthix/core'
import { fingerprintOf, verifyTransferChunk } from '@agenthix/core/host-crypto'
import { composeJson } from '../compose/projects'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { hostKeys } from '../identity/identity'
import { installSecrets } from '../state/secrets'
import { siteComposeProject } from '../install/siteCompose'
import { readSiteReport, siteContainerOf } from '../status/siteControl'
import type { ConsolePin } from '../link/pin'
import { withStore } from '../scheduled/store'
import { PeerChannel } from './peer'
import { endWaiting, readReceive, receiving as active, TRANSFER_DROPPED, writeReceive, type ReceiveRecord } from './record'
import { runHqReceive, settleHqAfterRestart } from './hqReceive'
import { clearSite, restoreMovedSite } from './restoreSite'
import { takeoverDeadlines, timingsOf } from './timings'
import { onUnheard } from './wire'
import { report } from './report'
import { installSubnets } from '../compose/subnets'

export type ReceiveRequest = Extract<MoveRequest, { role: 'receive' }>

/** Where the site's credential is kept, as `install/siteCompose.ts` reads it. */
const CREDENTIAL = ['site', 'credential.json']

export async function armReceive(ctx: Context, r: ReceiveRequest, pin: ConsolePin): Promise<{ transferId: string }> {
  if (r.target !== 'site') throw new Refusal('failed', 'This version of the host service cannot receive HQ yet: HQ moves with Move HQ….')
  const here = installed(ctx)
  if (here.hq || pin.local) throw new Refusal('conflict', `${ctx.machine.name} runs HQ; a site moves only to a machine that runs nothing.`)
  if (here.site) throw new Refusal('conflict', `${ctx.machine.name} already carries the site ${here.site.settings.name}; a site moves only to a machine that runs nothing.`)
  const own = await fingerprintOf((await hostKeys(ctx.state)).identity)
  if ((await fingerprintOf(r.peerIdentity)) !== r.peer || r.peer === own) throw new Refusal('malformed', 'The machine the site comes from is not named as it was pinned.')
  const before = readReceive(ctx.state)
  if (before && before.transferId !== r.transferId && before.phase !== 'waiting' && before.phase !== 'failed' && before.phase !== 'committed') {
    throw new Refusal('busy', `${ctx.machine.name} is taking in the site ${before.siteName} now.`)
  }
  if (!before || before.transferId !== r.transferId || before.phase === 'waiting') {
    writeReceive(ctx.state, {
      transferId: r.transferId, peer: r.peer, peerIdentity: r.peerIdentity, peerName: r.peerName, siteName: r.siteName,
      phase: 'waiting', armedAt: ctx.now().toISOString(), deadline: null, reason: null,
    })
  }
  return { transferId: r.transferId }
}

/**
 * Listens, from the service's start, for the first chunk of the move this machine waits for — or for hq dropping its
 * transfer before any came, which the Fleet Console does when the move ended before it began.
 */
export function receiveMoves(ctx: Context, pin: () => ConsolePin | null): void {
  onUnheard(ctx, (type, payload) => {
    if (type === 'transfer.closed' && typeof payload.transferId === 'string') {
      const r = readReceive(ctx.state)
      if (r?.phase === 'waiting' && !active.has(ctx.state.root)) endWaiting(ctx.state, payload.transferId, TRANSFER_DROPPED)
      return
    }
    if (type !== 'transfer.chunk' || payload.seq !== 0) return
    const record = readReceive(ctx.state)
    const p = pin()
    if (!record || record.phase !== 'waiting' || record.transferId !== payload.transferId || !p || active.has(ctx.state.root)) return
    if (record.target === 'hq') void runHqReceive(ctx, record, payload)
    else void runReceive(ctx, record, p, payload)
  })
}

/** Words the Fleet Console may send, checked as `move/code.ts` checks its answers. */
const TEXT = /^[^\u0000-\u001f\u007f]{1,500}$/

/** The pinned Fleet Console's `moveEnded`, from link/envelopes.ts once it opened it: why the move did not happen. */
export function moveEndedHeard(ctx: Context, message: Record<string, unknown>): void {
  const { transferId, reason } = message
  if (typeof transferId !== 'string' || typeof reason !== 'string' || !TEXT.test(reason) || active.has(ctx.state.root)) return
  endWaiting(ctx.state, transferId, reason)
}

class Failed extends Error {}

export async function runReceive(ctx: Context, armed: ReceiveRecord, pin: ConsolePin, first: Record<string, unknown>): Promise<void> {
  active.add(ctx.state.root)
  const keys = await hostKeys(ctx.state)
  const own = await fingerprintOf(keys.identity)
  const t = timingsOf(ctx)
  const channel = new PeerChannel(ctx, armed.transferId, keys, own, armed.peer, armed.peerIdentity).start()
  let record = armed
  const save = (patch: Partial<ReceiveRecord>) => {
    record = { ...record, ...patch }
    writeReceive(ctx.state, record)
  }
  const file = ctx.state.path('move', 'incoming.part')
  ctx.state.folder('move')
  let heartbeat: ReturnType<typeof setInterval> | null = null
  try {
    save({ phase: 'receiving' })
    await takeIn(ctx, channel, file, first, t.idleMs)
    save({ phase: 'restored' })
    await report(ctx, armed.transferId, 'restoring')
    heartbeat = setInterval(() => void channel.send({ step: 'restoring' }).catch(() => false), t.heartbeatMs)
    await channel.send({ step: 'restoring' })
    await restoreMovedSite(ctx, file, keys, pin.hqAddress)
    fs.rmSync(file, { force: true })
    await channel.send({ step: 'ready' })

    const release = await channel.nextStep(ctx.now().getTime() + t.idleMs, s => s.step === 'released' || s.step === 'abort')
    if (!release || release.step !== 'released') throw new Failed(release && 'reason' in release ? release.reason : 'the old machine did not hand the site over.')
    const { answerBy, commitBy } = takeoverDeadlines(ctx.now().getTime(), t)
    // Written down before the site starts: a restart past this deadline clears it, unless the commit came.
    save({ phase: 'starting', deadline: commitBy })
    ctx.state.writeJson(CREDENTIAL, { credential: release.credential, madeAt: ctx.now().toISOString() })
    const site = installed(ctx).site!
    const paths = await ctx.machinePaths()
    if (!paths) throw new Failed('the host service cannot find its state folder on this machine.')
    ctx.state.writePrivate(['site', 'compose.json'], composeJson(siteComposeProject(ctx.state, ctx.names, site.settings, installSecrets(ctx.state), paths, await installSubnets(ctx))))
    await ctx.docker.composeUp(site.project, site.file).catch(() => {
      throw new Failed(`the site could not start on ${ctx.machine.name}.`)
    })
    const answer = await takeover(ctx, answerBy, t.pollMs)
    if (answer === 'stopped') throw new Failed(`the site stopped on ${ctx.machine.name} as soon as it started.`)
    if (answer === 'late') throw new Failed(`the site did not answer HQ from ${ctx.machine.name} in time.`)
    save({ phase: 'tookOver' })
    await channel.send({ step: 'tookOver' })
    const commit = await channel.nextStep(commitBy, s => s.step === 'committed' || s.step === 'abort')
    if (commit?.step !== 'committed') throw new Failed(commit && 'reason' in commit ? commit.reason : 'the old machine did not confirm the move in time.')
    save({ phase: 'committed', deadline: null })
    await noteCompleted(ctx, release.change, record)
    await report(ctx, armed.transferId, 'tookOver')
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    const started = record.phase === 'starting' || record.phase === 'tookOver'
    let stopped = true
    const site = installed(ctx).site
    if (started && site) await ctx.docker.composeStop(site.project, site.file).catch(() => { stopped = false })
    await clearSite(ctx)
    save({ phase: 'failed', deadline: null, reason })
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
    // Only once nothing of the site runs here does the old machine hear it may start it again; otherwise it waits
    // out its deadline.
    if (stopped) await channel.send(started ? { step: 'gaveBack', reason: reason.slice(0, 400) } : { step: 'failed', reason: reason.slice(0, 400) }).catch(() => false)
    await report(ctx, armed.transferId, 'failed', reason)
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    fs.rmSync(file, { force: true })
    channel.stop()
    active.delete(ctx.state.root)
  }
}

/** The chunks, in order, each the old machine's own, written to `file`; the move ends at the first that is not. */
export function takeIn(ctx: Context, channel: PeerChannel, file: string, first: Record<string, unknown>, idleMs: number): Promise<void> {
  const fd = fs.openSync(file, 'w', 0o600)
  let expected = 0
  let chain = Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    let ended = false
    const end = (err?: Error) => {
      if (ended) return
      ended = true
      clearInterval(watch)
      channel.onChunk = null
      fs.closeSync(fd)
      if (err) reject(err)
      else resolve()
    }
    const take = async (raw: unknown) => {
      if (ended) return
      const chunk = raw as { seq: number; last: boolean }
      if (chunk.seq < expected) return
      if (chunk.seq > expected) return end(new Failed('a part of the backup did not arrive.'))
      const bytes = await verifyTransferChunk(raw as Parameters<typeof verifyTransferChunk>[0], channel.peerIdentity, { from: channel.peer, to: channel.own })
      if (!bytes) return end(new Failed('a part of the backup was not as the old machine sent it, so none of it was kept.'))
      fs.writeSync(fd, bytes)
      channel.ack(chunk.seq)
      expected++
      if (chunk.last) end()
    }
    channel.onChunk = c => { chain = chain.then(() => take(c)) }
    const watch = setInterval(() => {
      if (channel.closed) end(new Failed(`HQ stopped passing the backup on (${channel.closed}).`))
      else if (ctx.now().getTime() - channel.lastHeard > idleMs) end(new Failed('the old machine stopped sending the backup.'))
    }, Math.min(1000, idleMs))
    const parsed = parseTransferChunk(first)
    if (parsed) chain = chain.then(() => take(parsed))
    else end(new Failed('the first part of the backup is not one this host service reads.'))
  })
}

/** Container states of a site that is not running and will not answer: exited, or restarting after a crash. */
const DOWN = new Set(['exited', 'dead', 'restarting', 'removing'])

/** Whether the site answers hq by `by`, or its container stopped first (a crash loop counts), or neither by then. */
async function takeover(ctx: Context, by: number, pollMs: number): Promise<'answers' | 'stopped' | 'late'> {
  for (;;) {
    const site = installed(ctx).site
    const services = site ? await ctx.docker.composePs(site.project, site.file).catch(() => []) : []
    if (services.some(s => s.service === 'site' && DOWN.has(s.state))) return 'stopped'
    const container = site ? siteContainerOf(site.file) : null
    const r = container ? await readSiteReport(ctx.docker, container).catch(() => null) : null
    if (r?.connected) return 'answers'
    if (ctx.now().getTime() + pollMs > by) return 'late'
    await ctx.sleep(pollMs)
  }
}

/**
 * The move's own scheduled change, as completed, for this machine's site to pass on to hq — the old machine's site
 * is stopped for good — so hq resumes the paused runs. Numbers this machine gives its own changes start after it.
 */
async function noteCompleted(ctx: Context, change: ScheduledChange, r: ReceiveRecord): Promise<void> {
  const now = ctx.now()
  const request: ReceiveRequest = {
    op: 'move', role: 'receive', target: 'site', peer: r.peer, peerIdentity: r.peerIdentity, peerName: r.peerName, transferId: r.transferId, siteName: r.siteName,
  }
  await withStore(ctx.state, file => {
    file.nextId = Math.max(file.nextId, Number(change.id) + 1 || file.nextId)
    const done: ScheduledChange = { ...change, state: 'done' }
    file.entries.push({
      change: done,
      request,
      notice: { update: 'completed', change: done, sentAt: now.toISOString(), reason: null },
      delivered: false,
      endedAt: now.toISOString(),
    })
  })
}

/**
 * At start: a move this machine was taking in when the host service stopped did not complete — the old machine has
 * started its site again, or will once its deadline passes — so nothing of it stays here. A committed one stands.
 */
export async function settleAfterRestart(ctx: Context): Promise<void> {
  const record = readReceive(ctx.state)
  if (!record || record.phase === 'waiting' || record.phase === 'committed' || record.phase === 'failed') return
  if (record.target === 'hq') return settleHqAfterRestart(ctx, record)
  await clearSite(ctx)
  fs.rmSync(ctx.state.path('move', 'incoming.part'), { force: true })
  writeReceive(ctx.state, { ...record, phase: 'failed', deadline: null, reason: 'the host service restarted during the move.' })
}
