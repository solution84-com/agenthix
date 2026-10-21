import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { controllerOperation } from '../../owner/controller'
import { installed } from '../../service/context'
import { followSiteAddress } from '../../install/siteAddress'
import { HostAddressFollower } from '../addressFollow'
import { disconnectConsole } from '../manage'
import { readPin, writePin } from '../pin'
import type { Post } from '../leaving'
import { FakeConsole } from './fakeRelay'

const FIRST = 'http://192.168.65.254:4100'
const SECOND = 'http://192.168.0.13:4100'
const THIRD = 'http://192.168.0.21:4110'
const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const

let m: FakeMachine

beforeEach(async () => {
  m = fakeMachine()
  const fleetConsole = await FakeConsole.make()
  m.ctx.link = { start: () => {}, stop: () => {}, connected: () => false, sendEnvelope: () => {} }
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: FIRST,
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  await controllerOperation(m.ctx, { op: 'install', target: 'site', version: '0.2.0' }, fleetAdmin, readPin(m.ctx.state)!)
})
afterEach(() => m.cleanup())

function follower() {
  return new HostAddressFollower({
    state: m.ctx.state, redial: () => {}, now: () => new Date('2026-10-14T09:12:00Z'), later: () => () => {}, log: () => {},
    check: async () => 'passed', followed: (from, to) => followSiteAddress(m.ctx, from, to),
  })
}

async function follow(to: string) {
  const f = follower()
  f.take(to)
  expect(await f.tryNow()).toBe('passed')
}

const recorded = () => installed(m.ctx).site?.settings.hqUrl
const compose = () => fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8')

describe("the host service's record of the site's HQ address follows HQ @SC-856", () => {
  it('when the machine follows HQ to a new address, each time, and the compose file with it', async () => {
    expect(recorded()).toBe(FIRST)
    await follow(SECOND)
    expect(recorded()).toBe(SECOND)
    await follow(THIRD)
    expect(readPin(m.ctx.state)?.hqAddress).toBe(THIRD)
    expect(recorded()).toBe(THIRD)
    expect(compose()).toContain(THIRD)
    expect(compose()).not.toContain(FIRST)
  })

  it('leaves a site recorded at another address as it is', async () => {
    expect(await followSiteAddress(m.ctx, 'http://elsewhere.example:4100', SECOND)).toBe(false)
    expect(recorded()).toBe(FIRST)
  })

  it('so that, after HQ moved twice, leaving reaches HQ where it is now', async () => {
    await follow(SECOND)
    await follow(THIRD)
    const asked: string[] = []
    const post: Post = async url => { asked.push(url.toString()); return { status: 200, ok: true } }
    expect((await disconnectConsole(m.ctx, post)).hq).toBe('told')
    expect(asked).toEqual([`${THIRD}/api/v1/sites/leave`, `${THIRD}/api/v1/hosts/leave`])
  })
})
