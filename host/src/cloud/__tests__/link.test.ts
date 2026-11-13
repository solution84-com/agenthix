import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CloudResult } from '@agenthix/core'
import { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { StandInCloud } from '../../__tests__/standInCloud'
import { hostKeys } from '../../identity/identity'
import { pinCloudController } from '../../link/cloudController'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { cloudOperation } from '../dispatch'
import { startCloud, type CloudDeps } from '../start'
import { withFeature } from '@agenthix/core/testing'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5))
}

let m: FakeMachine
let cloud: StandInCloud
let logs: string[]
let asked: unknown[]
let handles: NonNullable<ReturnType<typeof startCloud>>[]

function start(o: Partial<CloudDeps> = {}) {
  const h = startCloud({
    state: m.ctx.state, settings: { url: 'https://cloud.example', machineId: 'machine-1', enrolmentCodeFile: null },
    keys: () => hostKeys(m.ctx.state), machineName: 'hq-box', dial: cloud.dial,
    operate: async (r): Promise<CloudResult> => { asked.push(r); return { ok: true, op: 'figures.read', result: {} as never } },
    log: l => logs.push(l), now: () => new Date(), sleep: () => tick(), replay: new EnvelopeReplayGuard(0), ...o,
  })!
  handles.push(h)
  return h
}

beforeEach(async () => {
  m = fakeMachine()
  cloud = await StandInCloud.make({ machineId: 'machine-1' })
  // Enrolled already: the stand-in knows the machine, and the machine pins the stand-in.
  cloud.host = (await hostKeys(m.ctx.state)).identity
  await pinCloudController(m.ctx.state, { identity: cloud.identity, machineId: 'machine-1', pinnedAt: new Date().toISOString() })
  cloud.sendHello = false
  logs = []
  asked = []
  handles = []
})
afterEach(() => {
  for (const h of handles) h.stop()
  m.cleanup()
})

async function opened() {
  const h = start()
  expect(await h.enrolled).toBe(true)
  await until(() => !!cloud.reconnection())
  return { h, conn: cloud.reconnection()! }
}

withFeature('cloud', () => {
  describe('reconnecting to Cloud @B2 @SC-1057', () => {
    it('does nothing until Cloud\'s first envelope, then takes its requests', async () => {
      const { h, conn } = await opened()
      await tick()
      expect(conn.sent).toEqual([])
      expect(h.link.connected()).toBe(false)
      await conn.deliver('relay.envelope', { envelope: await cloud.seal({ kind: 'hello' }) })
      await until(() => h.link.connected())
      expect(await cloud.ask({ op: 'figures.read' })).toMatchObject({ ok: true })
      expect(asked).toEqual([{ op: 'figures.read' }])
    })

    it('closes when the first frame is not an envelope', async () => {
      const { h, conn } = await opened()
      await conn.deliver('ping', {})
      await until(() => conn.closed)
      expect(conn.closed).toBe(true)
      expect(conn.sent).toEqual([])
      expect(h.link.connected()).toBe(false)
    })

    it('closes when the first envelope is from anyone but the pinned identity, and logs it without its content', async () => {
      const { conn } = await opened()
      const impostor = await FakeConsole.make('cloud')
      const envelope = await impostor.seal(cloud.host!, { kind: 'request', requestId: 'r1', by: { kind: 'cloud' }, request: { op: 'remoteAccess.off' } } as never)
      await conn.deliver('relay.envelope', { envelope })
      await until(() => conn.closed)
      expect(conn.closed).toBe(true)
      expect(asked).toEqual([])
      expect(logs.join('\n')).toContain('unknown_sender')
      expect(logs.join('\n')).not.toContain('remoteAccess')
    })

    it('closes when the first envelope was seen before', async () => {
      const replay = new EnvelopeReplayGuard(0)
      const first = start({ replay })
      await first.enrolled
      await until(() => !!cloud.reconnection())
      const hello = await cloud.seal({ kind: 'hello' })
      await cloud.reconnection()!.deliver('relay.envelope', { envelope: hello })
      await until(() => first.link.connected())
      first.stop()

      const second = start({ replay })
      await second.enrolled
      await until(() => !!cloud.reconnection())
      const conn = cloud.reconnection()!
      await conn.deliver('relay.envelope', { envelope: hello })
      await until(() => conn.closed)
      expect(conn.closed).toBe(true)
      expect(logs.join('\n')).toContain('replayed')
    })

    it('closes when Cloud does not prove itself in time', async () => {
      const h = start({ firstFrameMs: 10 })
      await h.enrolled
      await until(() => !!cloud.reconnection())
      const conn = cloud.reconnection()!
      await until(() => conn.closed)
      expect(conn.closed).toBe(true)
    })

    it('drops an envelope from anyone else once open, unanswered', async () => {
      const { h, conn } = await opened()
      await conn.deliver('relay.envelope', { envelope: await cloud.seal({ kind: 'hello' }) })
      await until(() => h.link.connected())
      const impostor = await FakeConsole.make('cloud')
      await conn.deliver('relay.envelope', { envelope: await impostor.seal(cloud.host!, { kind: 'request', requestId: 'x', by: { kind: 'cloud' }, request: { op: 'figures.read' } } as never) })
      await tick()
      await tick()
      expect(asked).toEqual([])
      expect(conn.sent).toEqual([])
      expect(h.link.connected()).toBe(true)
    })

    it('works while hq is down: it never passes through hq', async () => {
      m.hq.status = null
      cloud.sendHello = true
      start({ operate: r => cloudOperation(m.ctx, r) })
      await cloud.connected()
      const answer = await cloud.ask({ op: 'figures.read' })
      expect(answer).toMatchObject({ ok: true, op: 'figures.read' })
      expect(cloud.connections.every(c => c.url === 'wss://cloud.example/host-link')).toBe(true)
    })

    it('answers sealed to Cloud alone', async () => {
      cloud.sendHello = true
      start()
      await cloud.connected()
      await cloud.ask({ op: 'figures.read' })
      const reply = cloud.reconnection()!.sent.find(f => f.type === 'relay.envelope')!
      const other = await FakeConsole.make('cloud')
      expect((await other.open(reply.payload.envelope, cloud.host!)).ok).toBe(false)
    })
  })
})
