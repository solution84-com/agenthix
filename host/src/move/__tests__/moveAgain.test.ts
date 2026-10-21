import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSiteCredential } from '../../install/siteCompose'
import { readStore } from '../../scheduled/store'
import { readReceive, readSend, writeSend, type SendRecord } from '../record'
import { moveEndedHeard } from '../receive'
import { deliver } from '../wire'
import { siteAnswersHq, twoMachines, until, type Two } from './twoMachines'

let two: Two
beforeEach(async () => {
  two = await twoMachines()
})
afterEach(() => two.cleanup())

const SITE = 'agenthix-site'
const moveEntry = () => readStore(two.old.ctx.state).entries.find(e => e.change.kind === 'move')
const siteInstalledAt = () => (two.old.ctx.state.readJson('site', 'settings.json') as { installedAt: string }).installedAt

/** What an earlier move away from the old machine left on record. */
async function movedBefore(patch: Partial<SendRecord>): Promise<void> {
  const send = await two.moveRequest('send')
  writeSend(two.old.ctx.state, {
    transferId: 'transfer-earlier', peer: send.peer, peerIdentity: send.peerIdentity, phase: 'removed', releasedAt: 1, deadline: 2, reason: null, ...patch,
  })
}

describe('a machine that moved something away before @SC-858', () => {
  it('moves the site added since: HQ moved away from it, then a new site was added and moved', async () => {
    await movedBefore({ target: 'hq', installedAt: '2026-10-13T08:00:00.000Z', peerName: 'machine-d' })
    siteAnswersHq(two.fresh, true)
    await two.arm()
    expect(await two.sendNow()).toMatchObject({ ok: true })
    await two.run()
    expect(moveEntry()?.change.state).toBe('done')
    // The next move's record replaces the earlier one, and names the site it moved.
    expect(readSend(two.old.ctx.state)).toMatchObject({ transferId: 'transfer-0001', phase: 'committed', target: 'site', installedAt: siteInstalledAt() })
    expect(two.fresh.up.has(SITE)).toBe(true)
  })

  it('moves a new site after an earlier site moved away from it', async () => {
    await movedBefore({ target: 'site', installedAt: '2026-10-13T08:00:00.000Z' })
    siteAnswersHq(two.fresh, true)
    await two.arm()
    expect(await two.sendNow()).toMatchObject({ ok: true })
  })

  it('a record that names no install guards nothing here', async () => {
    await movedBefore({ target: 'hq' })
    await two.arm()
    expect(await two.sendNow()).toMatchObject({ ok: true })
  })
})

describe('a site that has moved away @SC-858', () => {
  it('is refused if asked to move again, and its copy here is never started', async () => {
    siteAnswersHq(two.fresh, true)
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    const again = { ...(await two.moveRequest('send')), transferId: 'transfer-0002' }
    expect(await two.as(two.old, again)).toMatchObject({ ok: false, refusal: { code: 'conflict', message: 'The site on office-server has moved already.' } })
    expect(two.old.up.has(SITE)).toBe(false)
    expect(readSiteCredential(two.old.ctx.state)).not.toBeNull()
  })

  it('is refused while its credential may still be taking over elsewhere', async () => {
    await movedBefore({ target: 'site', installedAt: siteInstalledAt(), phase: 'released', deadline: two.old.ctx.now().getTime() + 60_000 })
    expect(await two.sendNow()).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('may still be taking over') } })
    await two.old.ctx.sleep(61_000)
    await two.arm()
    expect(await two.sendNow()).toMatchObject({ ok: true })
  })

  it("is never removed on the word of HQ's move", async () => {
    await movedBefore({ target: 'hq', installedAt: siteInstalledAt(), phase: 'committed' })
    expect(await two.as(two.old, { op: 'remove', target: 'site' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(two.old.ctx.state.readJson('site', 'settings.json')).not.toBeNull()
  })
})

describe('the new machine, when the move ends before it began @SC-858', () => {
  it('stops waiting at once, with the reason the Fleet Console gives, and can be armed again', async () => {
    await two.arm()
    moveEndedHeard(two.fresh.ctx, { kind: 'moveEnded', transferId: 'transfer-0001', reason: 'The site on office-server has moved already.' })
    expect(readReceive(two.fresh.ctx.state)).toMatchObject({ phase: 'failed', reason: 'The site on office-server has moved already.' })
    // Ready for another move, or a site of its own.
    expect(await two.as(two.fresh, { ...(await two.moveRequest('receive')), transferId: 'transfer-0002' })).toMatchObject({ ok: true })
    expect(readReceive(two.fresh.ctx.state)).toMatchObject({ transferId: 'transfer-0002', phase: 'waiting' })
  })

  it('stops waiting when hq drops the transfer, and takes the Fleet Console\'s reason if it comes after', async () => {
    await two.arm()
    deliver(two.fresh.ctx, 'transfer.closed', { transferId: 'transfer-0001', reason: 'closed' })
    expect(readReceive(two.fresh.ctx.state)).toMatchObject({ phase: 'failed', reason: expect.stringContaining('ended the move before') })
    moveEndedHeard(two.fresh.ctx, { kind: 'moveEnded', transferId: 'transfer-0001', reason: 'A fleet admin cancelled the move.' })
    expect(readReceive(two.fresh.ctx.state)?.reason).toBe('A fleet admin cancelled the move.')
    expect(await two.as(two.fresh, { op: 'install', target: 'site', version: '0.2.0' })).toMatchObject({ ok: true })
  })

  it('ignores the word for another move, and once the old machine began', async () => {
    await two.arm()
    moveEndedHeard(two.fresh.ctx, { kind: 'moveEnded', transferId: 'transfer-other', reason: 'no' })
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('waiting')
    siteAnswersHq(two.fresh, true)
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase !== 'waiting')
    moveEndedHeard(two.fresh.ctx, { kind: 'moveEnded', transferId: 'transfer-0001', reason: 'too late' })
    await moving
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'committed')
    expect(moveEntry()?.change.state).toBe('done')
  })
})
