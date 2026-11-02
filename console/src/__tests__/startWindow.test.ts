import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EnvelopeReplayGuard, sealEnvelope } from '@agenthix/core/host-crypto'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

const SAM = { kind: 'fleetAdmin' as const, userId: 'u-sam', name: 'Sam Rivera' }
const FIGURES = { ok: true, op: 'figures.read', result: { machine: 'laptop' } } as const
let h: Harness
let host: FakeHost

beforeEach(async () => {
  // A guard that began now, as at a real start: every envelope is inside its start window.
  h = await startHarness({ replay: new EnvelopeReplayGuard(), commandTimeouts: { short: 300, long: 300, staleRetry: 5 } })
  host = await FakeHost.create()
  await h.ctx.hosts.pin({
    fingerprint: host.fingerprint, hostId: 'h-laptop', identity: host.keys.identity, machineName: 'laptop', siteName: 'laptop',
    executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: SAM.userId,
  })
  host.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
})
afterEach(async () => { await h.close() })

async function sendFiguresRead() {
  const answer = h.ctx.commands.send(host.fingerprint, { op: 'figures.read' }, SAM)
  await until(() => h.link.envelopes.length > 0)
  const envelope = h.link.envelopes.at(-1)!
  const opened = await host.open(envelope)
  if (!opened.ok) throw new Error('not opened')
  return { answer, envelope, requestId: (opened.message as { requestId: string }).requestId }
}

describe('a Fleet Console in its first moments', () => {
  it("takes a host service's fresh answer to its command at once", async () => {
    const { answer, requestId } = await sendFiguresRead()
    await h.ctx.commands.receive(await host.seal({ kind: 'result', replyTo: requestId, result: FIGURES as never }))
    await expect(answer).resolves.toEqual(FIGURES)
    expect(h.ctx.commands.dropped).toEqual([])
  })

  it("takes a just-started host service's stale refusal, and sends the command again", async () => {
    const { answer, envelope } = await sendFiguresRead()
    await h.ctx.commands.receive(await host.seal({ kind: 'refused', envelopeId: envelope.id, reason: 'stale' }))
    await until(() => h.link.envelopes.length > 1)
    const opened = await host.open(h.link.envelopes.at(-1)!)
    if (!opened.ok) throw new Error('not opened')
    const requestId = (opened.message as { requestId: string }).requestId
    await h.ctx.commands.receive(await host.seal({ kind: 'result', replyTo: requestId, result: FIGURES as never }))
    await expect(answer).resolves.toEqual(FIGURES)
  })

  it('refuses the same answer replayed, whether it comes at once or after the command settled', async () => {
    const { answer, requestId } = await sendFiguresRead()
    const result = await host.seal({ kind: 'result', replyTo: requestId, result: FIGURES as never })
    await Promise.all([h.ctx.commands.receive(result), h.ctx.commands.receive(result)])
    await answer
    // The copy that lost is refused: as replayed, or, if the command settled first, as answering nothing waiting.
    expect(h.ctx.commands.dropped).toHaveLength(1)
    expect(['replayed', 'stale']).toContain(h.ctx.commands.dropped[0]!.reason)
    await h.ctx.commands.receive(result)
    expect(h.ctx.commands.dropped).toHaveLength(2)
  })

  it('refuses, as stale, an answer to nothing it asked since it started, and what no command asked for', async () => {
    const { answer } = await sendFiguresRead()
    answer.catch(() => {})
    await h.ctx.commands.receive(await host.seal({ kind: 'result', replyTo: 'asked-before-a-restart', result: FIGURES as never }))
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('stale')
    await h.ctx.commands.receive(await host.seal({ kind: 'refused', envelopeId: 'an-envelope-from-before', reason: 'stale' }))
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('stale')
    await h.ctx.commands.receive(await host.seal({ kind: 'figures', figures: FIGURES.result as never }))
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('stale')
  })

  it('refuses an old answer, though it names the waiting command', async () => {
    const { answer, requestId } = await sendFiguresRead()
    answer.catch(() => {})
    const old = await sealEnvelope({
      sender: host.keys, recipient: host.consoleIdentity!, now: Date.now() - 10 * 60_000,
      message: { kind: 'result', replyTo: requestId, result: FIGURES as never },
    })
    await h.ctx.commands.receive(old)
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('expired')
  })

  it("does not take another machine's answer to the waiting command", async () => {
    const other = await FakeHost.create()
    other.consoleIdentity = host.consoleIdentity
    await h.ctx.hosts.pin({
      fingerprint: other.fingerprint, hostId: 'h-other', identity: other.keys.identity, machineName: 'other', siteName: 'other',
      executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: SAM.userId,
    })
    const { answer, requestId } = await sendFiguresRead()
    answer.catch(() => {})
    await h.ctx.commands.receive(await other.seal({ kind: 'result', replyTo: requestId, result: FIGURES as never }))
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('stale')
  })
})
