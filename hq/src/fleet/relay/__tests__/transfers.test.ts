import { describe, expect, it } from 'vitest'
import type { WebSocket } from 'ws'
import {
  HOST_TRANSFER_CHUNK_BYTES, HOST_TRANSFER_IDLE_MS, HOST_TRANSFER_MAX_BYTES_PER_SECOND, type RelayFrame,
} from '@agenthix/core'
import { TransferRoutes, type LiveEnd } from '../transfers'
import { hostLink, opened, sendFrame, startHarness } from './relayHarness'

type FakeWs = { ws: WebSocket; got: RelayFrame[] }

function fakeWs(): FakeWs {
  const got: RelayFrame[] = []
  const ws = { readyState: 1, OPEN: 1, send: (t: string) => got.push(JSON.parse(t) as RelayFrame) } as unknown as WebSocket
  return { ws, got }
}

const FP = { a: 'a'.repeat(64), b: 'b'.repeat(64), c: 'c'.repeat(64) }

function setup() {
  let clock = Date.parse('2026-10-14T09:00:00Z')
  const ends: Record<string, (LiveEnd & { got: RelayFrame[] }) | null> = {}
  for (const id of ['a', 'b', 'c'] as const) {
    const f = fakeWs()
    ends[id] = { ws: f.ws, fingerprint: FP[id], got: f.got }
  }
  const routes = new TransferRoutes(hostId => ends[hostId] ?? null, () => clock)
  routes.open({ transferId: 'transfer-1', fromHostId: 'a', toHostId: 'b', expiresAt: new Date(clock + 3600_000) })
  return { routes, ends, advance: (ms: number) => { clock += ms } }
}

const chunk = (seq: number, bytes = 1024) => ({
  transferId: 'transfer-1', seq, last: false, data: 'A'.repeat(Math.ceil((bytes * 4) / 3)), sig: 's'.repeat(86),
})
const envelope = (from: string, to: string) => ({
  v: 1, from, to, id: 'abcdefghijklmnopqrstuv', sentAt: 1, expiresAt: 2, epk: 'e'.repeat(43), iv: 'i'.repeat(16), ct: 'c'.repeat(40), sig: 's'.repeat(86),
})

describe("hq's relay of a site's move @SC-927", () => {
  it('passes chunks unchanged from the old machine to the new, and acknowledgements back', () => {
    const { routes, ends } = setup()
    const sent = chunk(0)
    routes.fromHost('a', ends.a!.ws, 'transfer.chunk', sent, 2000)
    expect(ends.b!.got).toEqual([expect.objectContaining({ type: 'transfer.chunk', payload: sent })])
    routes.fromHost('b', ends.b!.ws, 'transfer.ack', { transferId: 'transfer-1', seq: 0 }, 100)
    expect(ends.a!.got).toEqual([expect.objectContaining({ type: 'transfer.ack', payload: { transferId: 'transfer-1', seq: 0 } })])
  })

  it('passes nothing the Fleet Console did not open, nor to or from a third machine', () => {
    const { routes, ends } = setup()
    routes.fromHost('a', ends.a!.ws, 'transfer.chunk', { ...chunk(0), transferId: 'transfer-2' }, 2000)
    expect(ends.a!.got.map(f => f.payload)).toEqual([{ transferId: 'transfer-2', reason: 'not_allowed' }])
    routes.fromHost('c', ends.c!.ws, 'transfer.chunk', chunk(0), 2000)
    expect(ends.c!.got.map(f => f.payload)).toEqual([{ transferId: 'transfer-1', reason: 'not_allowed' }])
    // Chunks go one way only, and a machine's envelope only as itself, only to the other machine.
    routes.fromHost('b', ends.b!.ws, 'transfer.chunk', chunk(0), 2000)
    routes.fromHost('a', ends.a!.ws, 'transfer.envelope', { transferId: 'transfer-1', envelope: envelope(FP.c, FP.b) }, 2000)
    routes.fromHost('a', ends.a!.ws, 'transfer.envelope', { transferId: 'transfer-1', envelope: envelope(FP.a, FP.c) }, 2000)
    expect(ends.a!.got).toHaveLength(1)
    expect(ends.b!.got).toEqual([])
    routes.fromHost('a', ends.a!.ws, 'transfer.envelope', { transferId: 'transfer-1', envelope: envelope(FP.a, FP.b) }, 2000)
    expect(ends.b!.got.map(f => f.type)).toEqual(['transfer.envelope'])
  })

  it('drops a transfer when either machine leaves once it started, and never opens it again', () => {
    const { routes, ends } = setup()
    routes.hostLeft('b')
    // Not started yet: the permission waits for the move's time.
    expect(routes.isOpen('transfer-1')).toBe(true)
    routes.fromHost('a', ends.a!.ws, 'transfer.chunk', chunk(0), 2000)
    routes.hostLeft('b')
    expect(routes.isOpen('transfer-1')).toBe(false)
    expect(ends.a!.got.at(-1)?.payload).toEqual({ transferId: 'transfer-1', reason: 'peer_left' })
    expect(routes.open({ transferId: 'transfer-1', fromHostId: 'a', toHostId: 'b', expiresAt: new Date(Date.parse('2026-10-15T00:00:00Z')) })).toBe(false)
  })

  it('drops a transfer that goes faster than its pace, or falls silent', () => {
    const { routes, ends, advance } = setup()
    let seq = 0
    // Within the pace, chunk after chunk passes.
    for (let i = 0; i < 40; i++) {
      routes.fromHost('a', ends.a!.ws, 'transfer.chunk', chunk(seq++, HOST_TRANSFER_CHUNK_BYTES), 800_000)
      advance(Math.ceil((HOST_TRANSFER_CHUNK_BYTES / HOST_TRANSFER_MAX_BYTES_PER_SECOND) * 1000) + 1)
    }
    expect(routes.isOpen('transfer-1')).toBe(true)
    // All at once, it does not.
    for (let i = 0; i < 40 && routes.isOpen('transfer-1'); i++) routes.fromHost('a', ends.a!.ws, 'transfer.chunk', chunk(seq++, HOST_TRANSFER_CHUNK_BYTES), 800_000)
    expect(routes.isOpen('transfer-1')).toBe(false)
    expect(ends.b!.got.at(-1)?.payload).toEqual({ transferId: 'transfer-1', reason: 'too_fast' })

    const idle = setup()
    idle.routes.fromHost('a', idle.ends.a!.ws, 'transfer.chunk', chunk(0), 2000)
    idle.advance(HOST_TRANSFER_IDLE_MS + 1)
    idle.routes.sweep()
    expect(idle.ends.a!.got.at(-1)?.payload).toEqual({ transferId: 'transfer-1', reason: 'idle' })
  })

  it("keeps the last steps of hq's own move open while either machine is away, dropping only the frame", () => {
    const { routes, ends } = setup()
    routes.open({ transferId: 'transfer-hq-1', fromHostId: 'a', toHostId: 'b', expiresAt: new Date(Date.parse('2026-10-14T10:00:00Z')), waitForEnds: true })
    const away = ends.a
    ends.a = null
    const step = { transferId: 'transfer-hq-1', envelope: envelope(FP.b, FP.a) }
    routes.fromHost('b', ends.b!.ws, 'transfer.envelope', step, 2000)
    routes.hostLeft('a')
    expect(routes.isOpen('transfer-hq-1')).toBe(true)
    expect(ends.b!.got).toEqual([])
    ends.a = away
    routes.fromHost('b', ends.b!.ws, 'transfer.envelope', step, 2000)
    expect(away!.got.map(f => f.type)).toEqual(['transfer.envelope'])
  })

  it('drops a frame too large to be a chunk, and the transfer with it', () => {
    const { routes, ends } = setup()
    routes.fromHost('a', ends.a!.ws, 'transfer.chunk', chunk(0), 2_000_000)
    expect(ends.b!.got.map(f => f.payload)).toEqual([{ transferId: 'transfer-1', reason: 'too_large' }])
  })
})

describe('the host link carries a move @SC-927', () => {
  it('between the two machines of an open transfer, over their own connections', async () => {
    const h = await startHarness()
    try {
      h.hosts.set('hmc-a'.padEnd(40, 'a'), { hostId: 'a', fingerprint: FP.a, consoleFingerprint: 'm'.repeat(64) })
      h.hosts.set('hmc-b'.padEnd(40, 'b'), { hostId: 'b', fingerprint: FP.b, consoleFingerprint: 'm'.repeat(64) })
      const a = hostLink(h, { Authorization: `Bearer ${'hmc-a'.padEnd(40, 'a')}` })
      const b = hostLink(h, { Authorization: `Bearer ${'hmc-b'.padEnd(40, 'b')}` })
      await Promise.all([opened(a), opened(b)])
      await new Promise(resolve => setTimeout(resolve, 20))
      h.hub.transfers.open({ transferId: 'transfer-1', fromHostId: 'a', toHostId: 'b', expiresAt: new Date(Date.now() + 60_000) })
      sendFrame(a, 'transfer.chunk', chunk(0))
      expect((await b.next('transfer.chunk')).payload).toEqual(chunk(0))
      b.ws.close()
      expect((await a.next('transfer.closed')).payload).toEqual({ transferId: 'transfer-1', reason: 'peer_left' })
      a.ws.close()
    } finally {
      await h.close()
    }
  })
})
