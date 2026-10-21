/**
 * `agenthix hq move recover` (spec §13): the way back from a move of hq that ended on neither machine. This machine
 * committed — it never starts hq by itself after that — but the commit never reached the new machine, which gave hq
 * back at its deadline. hq is then stopped on both; this machine still holds everything, since its copy goes only once
 * the new machine says hq answers there.
 *
 * Only its machine admin can say that hq does not run on the new machine, so it starts nothing without that
 * confirmation. It refuses outright what it can tell for itself: before the new machine's deadline has passed, while
 * this machine reaches hq at its new address, and once the move completed and the copy here was removed.
 */
import { formatFingerprint, type ScheduledChange } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { exclusive } from '../backups/take'
import { withStore } from '../scheduled/store'
import { deliverNotices } from '../scheduled/notices'
import { readSend, writeSend, type SendRecord } from './record'
import { rollbackHq } from './hqSend'
import { hqAnswersBy } from './hqSteps'
import { report } from './report'

export type RecoverCheck = {
  machine: string
  /** The machine hq was moving to. */
  peerName: string
  /** Where hq answered on the new machine, and where it answers here again. */
  hqAddress: string
  address: string
}

export type RecoverResult = RecoverCheck & { state: 'started' }

function peerOf(record: SendRecord): string {
  return record.peerName ?? `the new machine (its fingerprint ${formatFingerprint(record.peer)})`
}

/** What recovering would do, or why it is refused; changes nothing. */
export function hqRecoverCheck(ctx: Context): RecoverCheck {
  const machine = ctx.machine.name
  const record = readSend(ctx.state)
  if (record?.target !== 'hq') throw new Refusal('not_found', `HQ has not moved from ${machine}: there is no move of HQ to recover here.`)
  const peer = peerOf(record)
  if (record.phase === 'removed') {
    throw new Refusal('conflict', `Refused: HQ took over on ${peer}, and the copy on ${machine} was removed as the move's last step. Nothing was started.`)
  }
  if (record.phase === 'rolledBack') throw new Refusal('conflict', `HQ runs here already: the move to ${peer} did not complete, and HQ was started on ${machine} again.`)
  if (record.phase !== 'committed') throw new Refusal('conflict', `HQ is moving to ${peer} now. If the move does not complete, HQ starts on ${machine} again by itself.`)
  const { hq, site } = installed(ctx)
  if (!hq || !site) throw new Refusal('not_installed', `Nothing of HQ is kept on ${machine} to start again.`)
  if (record.deadline && ctx.now().getTime() < record.deadline) {
    throw new Refusal('conflict', `Not yet: ${peer} may still be taking HQ over, until ${new Date(record.deadline).toISOString()}. If HQ does not answer there by then, run this again.`)
  }
  const hqAddress = record.hqAddress ?? hq.settings.address
  if (ctx.link?.connected()) {
    throw new Refusal('conflict', `Refused: ${machine} is connected to HQ at ${hqAddress}, so HQ runs there, on ${peer}. Nothing was started.`)
  }
  return { machine, peerName: peer, hqAddress, address: record.previousAddress ?? hq.settings.address }
}

export function recoverHq(ctx: Context, confirmed: boolean): Promise<RecoverResult> {
  return exclusive('move', async () => {
    const check = hqRecoverCheck(ctx)
    if (!confirmed) {
      throw new Refusal('conflict', `Not started: first make sure HQ is not running on ${check.peerName}. If it ran there and here, changes made on one of them would be lost. Agree to that first. Nothing was started.`)
    }
    const record = readSend(ctx.state)!
    const reason = `HQ was started on ${check.machine} again by its machine admin: the move to ${check.peerName} ended on neither machine.`
    // Written down before anything starts: the Fleet Console's late `remove` of the copy here is refused from now on.
    writeSend(ctx.state, { ...record, phase: 'rolledBack', reason, recoveredAt: ctx.now().toISOString() })
    await rollbackHq(ctx, record, reason, true)
    await noteFailed(ctx, record.transferId, reason)
    // The report above went as the link redialled hq here; once it is up, the Fleet Console is told again.
    if (await hqAnswersBy(ctx, ctx.now().getTime() + ctx.waits.hqMs, ctx.waits.pollMs) && await linkUp(ctx)) {
      await report(ctx, record.transferId, 'rolledBack', reason)
    }
    return { ...check, state: 'started' }
  })
}

async function linkUp(ctx: Context): Promise<boolean> {
  const until = ctx.now().getTime() + ctx.waits.hqMs
  while (!(ctx.link?.connected() ?? false)) {
    if (ctx.now().getTime() >= until) return false
    await ctx.sleep(ctx.waits.pollMs)
  }
  return true
}

/** The move's change, which ended as done when this machine committed, reads as failed, for hq to hear. */
async function noteFailed(ctx: Context, transferId: string, reason: string): Promise<void> {
  const now = ctx.now().toISOString()
  await withStore(ctx.state, file => {
    const entry = file.entries.find(e => e.request.op === 'move' && e.request.transferId === transferId)
    if (!entry) return
    const change: ScheduledChange = { ...entry.change, state: 'rolledBack' }
    Object.assign(entry, { change, notice: { update: 'failed', change, sentAt: now, reason }, delivered: false, endedAt: entry.endedAt ?? now })
  })
  await deliverNotices(ctx).catch(() => {})
}
