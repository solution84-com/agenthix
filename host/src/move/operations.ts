/**
 * A site's move as the Fleet Console asks it of each machine (spec §13 *A site moves*): `move` with `role: 'receive'`
 * arms the new machine; `move` with `role: 'send'` runs the move from the old one now, and `schedule` with it runs it
 * later — either way as a scheduled change, so members are told and runs pause around it (§14). `remove` of the site
 * takes away the copy the old machine kept, once the move committed: the move's last step, not an erase. With
 * `target: 'hq'`, the same for hq with its default site (hqSend.ts, hqReceive.ts).
 */
import fs from 'node:fs'
import type { HostActor, MoveRequest } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import type { ConsolePin } from '../link/pin'
import { registerScheduledChange } from '../scheduled/registry'
import { scheduleChange, tickScheduled } from '../scheduled/scheduler'
import { readSend, sendOf, writeSend } from './record'
import { armReceive } from './receive'
import { runMoveSend, sendCheck, type SendRequest } from './send'
import { report } from './report'
import { hqSendCheck, runHqMoveSend } from './hqSend'
import { armHqReceive } from './hqReceive'

registerScheduledChange('move', {
  kind: 'move',
  target: r => r.target,
  detail: (_ctx, r) => r.peerName,
  expectedMinutes: 30,
  holdsMachine: true,
  check: (ctx, r) => {
    if (r.role !== 'send') throw new Refusal('conflict', 'A machine takes in a site when the Fleet Console arms it, not at a set time.')
    if (r.target === 'hq') hqSendCheck(ctx, r)
    else sendCheck(ctx, r)
  },
  run: (ctx, r, waiting) => (r.target === 'hq' ? runHqMoveSend(ctx, r as SendRequest, waiting) : runMoveSend(ctx, r as SendRequest, waiting)),
})

/** `move` from the Fleet Console. A send runs now: set a second ahead, so the scheduler runs it and tells hq. */
export async function moveOperation(ctx: Context, request: MoveRequest, by: HostActor, pin: ConsolePin): Promise<{ transferId: string }> {
  if (request.role === 'receive') return request.target === 'hq' ? armHqReceive(ctx, request, pin) : armReceive(ctx, request, pin)
  if (request.target === 'hq') hqSendCheck(ctx, request)
  else sendCheck(ctx, request)
  await scheduleChange(ctx, request, new Date(ctx.now().getTime() + 1000).toISOString(), by)
  setTimeout(() => void tickScheduled(ctx).catch(() => {}), 1100)
  return { transferId: request.transferId }
}

/** The move's last step: the copy the old machine kept, removed once the site answers from the new one. */
export async function removeMovedSite(ctx: Context): Promise<{ state: 'removed' }> {
  const record = readSend(ctx.state)
  // A commit counts only for the site installed here now, never for HQ's move; once removed, asking again is done.
  const ofThisSite = record?.phase === 'committed' && sendOf(ctx, 'site') !== null
  if (!record || record.target === 'hq' || !(ofThisSite || record.phase === 'removed')) {
    throw new Refusal('conflict', `The site on ${ctx.machine.name} is removed here only once it has moved to another machine, and it has not.`)
  }
  if (record.phase === 'removed') return { state: 'removed' }
  const site = installed(ctx).site
  if (site) {
    await ctx.docker.composeDownWithVolumes(site.project, site.file)
    await ctx.docker.removeGroup(ctx.names.agentsProject)
  }
  // The site's settings, its credential and its workspaces; its backups stay, sealed to this machine.
  fs.rmSync(ctx.state.path('site'), { recursive: true, force: true })
  writeSend(ctx.state, { ...record, phase: 'removed' })
  await report(ctx, record.transferId, 'removed')
  return { state: 'removed' }
}
