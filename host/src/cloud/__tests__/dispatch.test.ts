import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostIdentity } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { pinCloudController } from '../../link/cloudController'
import { Refusal } from '../../owner/results'
import { cloudOperation } from '../dispatch'
import type { CloudOnlyHandlers } from '../handlers'
import { withFeature } from '@agenthix/core/testing'

const shared = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('../../owner/dispatch', () => ({
  hostOperation: async (...args: unknown[]) => {
    shared.calls.push(args)
    return { state: 'stopped' }
  },
}))

let m: FakeMachine

beforeEach(async () => {
  m = fakeMachine()
  shared.calls = []
  const keys = await generateHostKeys('cloud')
  await pinCloudController(m.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: new Date().toISOString() })
})
afterEach(() => m.cleanup())

describe('what Cloud asks while Agenthix Cloud is off (adr-0189) @SC-2130', () => {
  it('is refused as not available, even from the pinned Cloud identity, and nothing is done', async () => {
    expect(await cloudOperation(m.ctx, { op: 'stop', target: 'site' })).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('not available') } })
    expect(shared.calls).toEqual([])
  })
})

withFeature('cloud', () => {
  describe('what Cloud asks @SC-1059', () => {
    it('goes to the shared handlers for what a Fleet Console may ask, recorded as Cloud\'s', async () => {
      const r = await cloudOperation(m.ctx, { op: 'stop', target: 'site' })
      expect(r).toEqual({ ok: true, op: 'stop', result: { state: 'stopped' } })
      expect(shared.calls[0][1]).toEqual({ op: 'stop', target: 'site' })
      expect(shared.calls[0][3]).toEqual({ kind: 'cloud' })
    })

    it('is refused when it is not in the closed set', async () => {
      expect(await cloudOperation(m.ctx, { op: 'console.connect' })).toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
      expect(await cloudOperation(m.ctx, { op: 'stop', target: 'everything' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
      expect(shared.calls).toEqual([])
    })

    it('answers unknown_operation for one of its own with no handler yet', async () => {
      expect(await cloudOperation(m.ctx, { op: 'resize.prepare' }, {})).toMatchObject({ ok: false, op: 'resize.prepare', refusal: { code: 'unknown_operation' } })
    })

    it('goes to the registry for one of its own, rebuilt by the handler before it runs', async () => {
      const ran: unknown[] = []
      const handlers: CloudOnlyHandlers = {
        'remoteAccess.csr': {
          parse: r => {
            if (typeof r.name !== 'string') throw new Refusal('malformed', 'The request\'s name is missing or not valid.')
            return { op: 'remoteAccess.csr', name: r.name }
          },
          run: async (_ctx, request) => { ran.push(request); return { csr: 'CSR' } },
        },
      }
      expect(await cloudOperation(m.ctx, { op: 'remoteAccess.csr', name: 'fc.example', extra: 1 }, handlers)).toEqual({ ok: true, op: 'remoteAccess.csr', result: { csr: 'CSR' } })
      expect(ran).toEqual([{ op: 'remoteAccess.csr', name: 'fc.example' }])
      expect(await cloudOperation(m.ctx, { op: 'remoteAccess.csr' }, handlers)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
      expect(ran).toHaveLength(1)
    })

    it('does nothing on a machine not enrolled with Cloud', async () => {
      const other = fakeMachine()
      try {
        expect(await cloudOperation(other.ctx, { op: 'stop', target: 'site' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
        expect(await cloudOperation(other.ctx, { op: 'resize.prepare' })).toMatchObject({ ok: false })
        expect(shared.calls).toEqual([])
      } finally {
        other.cleanup()
      }
    })
  })
})
