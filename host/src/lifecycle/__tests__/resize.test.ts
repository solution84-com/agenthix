import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostIdentity, ScheduledChangeNotice } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { pinCloudController } from '../../link/cloudController'
import { cloudOperation } from '../../cloud/dispatch'
import { ownerHandler } from '../../owner/dispatch'
import { nightlyTick } from '../../backups/nightly'
import { suspended } from '../suspend'
import { resizeUnderWay } from '../resize'
import { withFeature } from '@agenthix/core/testing'

let m: FakeMachine
const ask = (op: string) => cloudOperation(m.ctx, { op })
const sentToHq = (): ScheduledChangeNotice[] =>
  m.calls.filter(c => c[0] === 'exec' && c.includes('scheduled-change')).map(c => JSON.parse(c[c.length - 1]) as ScheduledChangeNotice)
const composeVerbs = () => m.calls.filter(c => c[0] === 'compose' && (c.includes('stop') || c.includes('up')))
  .map(c => `${c[c.indexOf('-p') + 1]} ${c[c.indexOf('-f') + 2]}`)

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  const keys = await generateHostKeys('cloud')
  await pinCloudController(m.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: new Date().toISOString() })
  m.calls.length = 0
})
afterEach(() => m.cleanup())

withFeature('cloud', () => {
  describe('a resize Cloud does @SC-1065', () => {
    it('prepare stops what runs by the path a suspension takes, so HQ is told, and records the resize', async () => {
      expect(await ask('resize.prepare')).toEqual({ ok: true, op: 'resize.prepare', result: { state: 'paused' } })
      expect(composeVerbs()).toEqual(['agenthix-site stop', 'agenthix-hq stop'])
      expect(sentToHq().map(n => [n.update, n.change.kind, n.change.scheduledBy])).toEqual([
        ['scheduled', 'suspend', { kind: 'cloud' }], ['started', 'suspend', { kind: 'cloud' }], ['completed', 'suspend', { kind: 'cloud' }],
      ])
      expect(resizeUnderWay(m.ctx)).toBe(true)
    })

    it('keeps runs paused across a restart of the host service, until finish', async () => {
      await ask('resize.prepare')
      // A restart loses the process, not the state folder: a second asking of prepare changes nothing and starts nothing.
      m.calls.length = 0
      expect(await ask('resize.prepare')).toMatchObject({ ok: true, result: { state: 'paused' } })
      expect(composeVerbs()).toEqual([])
      expect(suspended(m.ctx).hq).toBeTruthy()
      // The nightly backup, like the rest, leaves a paused machine alone.
      expect(await nightlyTick(m.ctx)).toBeFalsy()
      expect(resizeUnderWay(m.ctx)).toBe(true)
    })

    it('finish starts the services again and forgets the resize', async () => {
      await ask('resize.prepare')
      m.calls.length = 0
      expect(await ask('resize.finish')).toEqual({ ok: true, op: 'resize.finish', result: { state: 'started' } })
      expect(composeVerbs()).toEqual(['agenthix-hq up', 'agenthix-site up'])
      expect(suspended(m.ctx)).toEqual({})
      expect(resizeUnderWay(m.ctx)).toBe(false)
    })

    it('finish with no resize under way is a conflict, and starts nothing', async () => {
      expect(await ask('resize.finish')).toMatchObject({ ok: false, op: 'resize.finish', refusal: { code: 'conflict' } })
      expect(composeVerbs()).toEqual([])
    })

    it('leaves suspended what a person had suspended before the resize', async () => {
      await ownerHandler(m.ctx)({ op: 'suspend', target: 'hq' }, () => {})
      m.calls.length = 0
      await ask('resize.prepare')
      expect(composeVerbs()).toEqual([])
      await ask('resize.finish')
      expect(composeVerbs()).toEqual([])
      expect(suspended(m.ctx).hq).toBeTruthy()
      expect(resizeUnderWay(m.ctx)).toBe(false)
    })

    it('takes nothing but its name', async () => {
      expect(await cloudOperation(m.ctx, { op: 'resize.prepare', extra: 1 })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
      expect(resizeUnderWay(m.ctx)).toBe(false)
    })
  })
})
