import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TransferStep } from '@agenthix/core'
import { EnvelopeReplayGuard, generateHostKeys, openEnvelope, sealEnvelope, type HostKeys } from '@agenthix/core/host-crypto'
import { hostKeys } from '../../identity/identity'
import { readStore } from '../../scheduled/store'
import { readReceive, readSend } from '../record'
import { setTimings } from '../timings'
import { deliver } from '../wire'
import { QUICK, siteAnswersHq, twoMachines, until, type Two } from './twoMachines'

let two: Two
beforeEach(async () => {
  two = await twoMachines()
})
afterEach(() => two.cleanup())

const SITE = 'agenthix-site'
const moveEntry = () => readStore(two.old.ctx.state).entries.find(e => e.change.kind === 'move')
const reports = (from: 'old' | 'new') => two.told[from].flatMap(m => (m.kind === 'move' ? [m.report.state] : []))
const phaseNew = () => readReceive(two.fresh.ctx.state)?.phase

/** The new machine's site container, once up, is in `state` as compose reports it. */
function siteIs(state: string): void {
  const docker = two.fresh.ctx.docker
  const ps = docker.composePs.bind(docker)
  docker.composePs = async (project, file) => (await ps(project, file)).map(s => (s.service === 'site' ? { ...s, state } : s))
}

/** A step as `sender` seals it to the old machine, for the transfer `transferId`, by the old machine's clock. */
async function stepToOld(sender: HostKeys, step: TransferStep, transferId = 'transfer-0001'): Promise<Record<string, unknown>> {
  const envelope = await sealEnvelope({
    sender, recipient: (await hostKeys(two.old.ctx.state)).identity, now: two.old.ctx.now().getTime(), lifetimeMs: 60_000,
    message: { kind: 'transfer', transferId, step },
  })
  return { transferId, envelope }
}

/** Reads which step an envelope from the new machine carries, as the old machine would, without spending its replay guard. */
async function wordReader(): Promise<(payload: Record<string, unknown>) => Promise<string | null>> {
  const oldKeys = await hostKeys(two.old.ctx.state)
  const freshIdentity = (await hostKeys(two.fresh.ctx.state)).identity
  const replay = new EnvelopeReplayGuard(0)
  return async payload => {
    const opened = await openEnvelope(payload.envelope, {
      recipient: oldKeys, pinned: fp => (fp === two.newFp ? freshIdentity : null), replay, now: two.old.ctx.now().getTime(),
    })
    return opened.ok ? ((opened.message as { step?: { step?: string } }).step?.step ?? null) : null
  }
}

/** Watches, every millisecond, whether the site ever runs on both machines at once. */
function watchBoth(): { stop: () => boolean } {
  let both = false
  const timer = setInterval(() => { if (two.old.up.has(SITE) && two.fresh.up.has(SITE)) both = true }, 1)
  return { stop: () => { clearInterval(timer); return both } }
}

describe('a takeover that cannot work ends on the new machine\'s word @SC-858', () => {
  it.each([
    ['exits as soon as it starts', 'exited'],
    ['keeps restarting', 'restarting'],
  ])('when the site %s, the new machine stops it and the old one starts it again at once', async (_what, state) => {
    siteAnswersHq(two.fresh, false)
    siteIs(state)
    const both = watchBoth()
    await two.arm()
    await two.sendNow()
    await two.run()

    const received = readReceive(two.fresh.ctx.state)!
    expect(received).toMatchObject({ phase: 'failed', reason: 'the site stopped on new-server as soon as it started.' })
    expect(two.fresh.up.has(SITE)).toBe(false)
    // On the word, not at the deadline: the old machine let its deadline go.
    expect(readSend(two.old.ctx.state)).toMatchObject({ phase: 'rolledBack', deadline: null })
    expect(two.old.up.has(SITE)).toBe(true)
    expect(moveEntry()?.notice?.reason).toMatch(/stopped on new-server as soon as it started/)
    expect(reports('new')).toEqual(['restoring', 'failed'])
    expect(reports('old')).toContain('rolledBack')
    expect(both.stop()).toBe(false)
  })

  it('when the site cannot start at all, the same', async () => {
    const docker = two.fresh.ctx.docker
    const up = docker.composeUp.bind(docker)
    docker.composeUp = async (project, file) => {
      if (phaseNew() === 'starting') throw new Error('docker compose up failed: port in use')
      return up(project, file)
    }
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readReceive(two.fresh.ctx.state)).toMatchObject({ phase: 'failed', reason: 'the site could not start on new-server.' })
    expect(readSend(two.old.ctx.state)).toMatchObject({ phase: 'rolledBack', deadline: null })
    expect(two.old.up.has(SITE)).toBe(true)
  })

  it('takes the word even when hq drops the transfer right behind it, as it does once the Fleet Console hears the move failed', async () => {
    siteAnswersHq(two.fresh, false)
    siteIs('exited')
    const word = await wordReader()
    let relayed = Promise.resolve()
    two.hq.act = (from, type, payload) => {
      if (from !== 'new' || type !== 'transfer.envelope') return payload
      // Picked out by what it says, not by when it went: a heartbeat sealed before the word was written may still be on
      // its way, and dropping the transfer behind that one would come before the word. In the order they came.
      relayed = relayed.then(async () => {
        const step = await word(payload)
        deliver(two.old.ctx, type, payload)
        // Delivered while the old machine is still opening the word.
        if (step === 'gaveBack' || step === 'failed') deliver(two.old.ctx, 'transfer.closed', { transferId: 'transfer-0001', reason: 'closed' })
      })
      return null
    }
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readSend(two.old.ctx.state)).toMatchObject({ phase: 'rolledBack', deadline: null })
    expect(two.old.up.has(SITE)).toBe(true)
  })

  it.each([
    ['sealed by a machine the Fleet Console did not name', 'stranger'],
    ['for another transfer', 'otherTransfer'],
  ])('ignores a word %s, and waits out its deadline', async (_what, forgery) => {
    siteAnswersHq(two.fresh, false)
    siteIs('exited')
    const stranger = await generateHostKeys('host')
    const freshKeys = await hostKeys(two.fresh.ctx.state)
    two.hq.act = (from, type, payload) => {
      // The new machine's own word is lost on the way; a forged one comes in its place.
      if (from !== 'new' || type !== 'transfer.envelope' || phaseNew() !== 'failed') return payload
      const forged = forgery === 'stranger'
        ? stepToOld(stranger, { step: 'gaveBack', reason: 'forged' })
        : stepToOld(freshKeys, { step: 'gaveBack', reason: 'another move' }, 'transfer-0002')
      void forged.then(p => deliver(two.old.ctx, 'transfer.envelope', p))
      return null
    }
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => phaseNew() === 'failed')
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(readSend(two.old.ctx.state)).toMatchObject({ phase: 'released', deadline: expect.any(Number) })
    expect(two.old.up.has(SITE)).toBe(false)

    await two.old.ctx.sleep(120_000)
    await moving
    expect(two.old.up.has(SITE)).toBe(true)
    expect(moveEntry()?.notice?.reason).toMatch(/did not take over on new-server in time/)
  })

  it('a tookOver that comes after the word it gave the site back never takes it', async () => {
    siteAnswersHq(two.fresh, false)
    siteIs('exited')
    const freshKeys = await hostKeys(two.fresh.ctx.state)
    const word = await wordReader()
    let relayed = Promise.resolve()
    two.hq.act = (from, type, payload) => {
      if (from !== 'new' || type !== 'transfer.envelope') return payload
      // Behind the word itself, not behind a heartbeat still on its way when it was written (see above).
      relayed = relayed.then(async () => {
        const step = await word(payload)
        deliver(two.old.ctx, type, payload)
        if (step === 'gaveBack') deliver(two.old.ctx, 'transfer.envelope', await stepToOld(freshKeys, { step: 'tookOver' }))
      })
      return null
    }
    const both = watchBoth()
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readSend(two.old.ctx.state)?.phase).toBe('rolledBack')
    expect(two.old.up.has(SITE)).toBe(true)
    expect(two.fresh.up.has(SITE)).toBe(false)
    expect(both.stop()).toBe(false)
  })

  it('a word that it gave the site back, after its tookOver, never starts the site on the old machine again', async () => {
    // One step at a time from the new machine: its tookOver is the first envelope once it has taken over.
    setTimings(two.fresh.ctx, { ...QUICK, heartbeatMs: 60_000 })
    siteAnswersHq(two.fresh, true)
    const freshKeys = await hostKeys(two.fresh.ctx.state)
    let injected = false
    two.hq.act = (from, type, payload) => {
      if (!injected && from === 'new' && type === 'transfer.envelope' && phaseNew() === 'tookOver') {
        injected = true
        void stepToOld(freshKeys, { step: 'gaveBack', reason: 'late' }).then(p => deliver(two.old.ctx, 'transfer.envelope', p))
      }
      return payload
    }
    const both = watchBoth()
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(injected).toBe(true)
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    await until(() => phaseNew() === 'committed')
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(two.old.up.has(SITE)).toBe(false)
    expect(two.fresh.up.has(SITE)).toBe(true)
    expect(both.stop()).toBe(false)
  })
})

describe('while the site takes its time to answer @SC-858', () => {
  it('the new machine keeps the transfer alive, so hq does not drop it as silent and the takeover still completes', async () => {
    siteAnswersHq(two.fresh, false)
    // The new machine asks its site in real time here, so the test can let it answer after a while.
    two.fresh.ctx.sleep = () => new Promise(resolve => setTimeout(resolve, 10))
    // hq drops a transfer through which nothing passed for a while (here one second, so a slow runner's pauses are not taken for silence), telling both machines.
    let last = Date.now()
    let dropped = false
    const sweep = setInterval(() => {
      if (dropped || Date.now() - last <= 1000) return
      dropped = true
      for (const m of [two.old, two.fresh]) deliver(m.ctx, 'transfer.closed', { transferId: 'transfer-0001', reason: 'idle' })
    }, 50)
    two.hq.act = (_from, _type, payload) => {
      if (dropped) return null
      last = Date.now()
      return payload
    }
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => phaseNew() === 'starting')
    await new Promise(resolve => setTimeout(resolve, 1500))
    siteAnswersHq(two.fresh, true)
    await moving
    clearInterval(sweep)
    expect(dropped).toBe(false)
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
  }, 30_000)
})
