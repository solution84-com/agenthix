import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { controllerOperation } from '../../owner/controller'
import { disconnectConsole, forgetConsole } from '../manage'
import { deliverLeaving, readLeavingNotice, startLeavingNotices, type Post } from '../leaving'
import { readPin, writePin } from '../pin'
import { writeReceive, writeSend } from '../../move/record'
import { disconnected } from '../../cli/consoleWords'
import { FakeConsole } from './fakeRelay'

let m: FakeMachine
let asked: { url: string; init: RequestInit }[]
let answer: () => Promise<{ status: number; ok: boolean }>

const post: Post = async (url, init) => {
  asked.push({ url: url.toString(), init })
  return answer()
}
const status = (code: number) => async () => ({ status: code, ok: code >= 200 && code < 300 })
const unreachable = async (): Promise<never> => { throw new Error('ECONNREFUSED') }

const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const
const MACHINE_CREDENTIAL = 'hmc_0123456789abcdef'
const credentialFile = () => m.ctx.state.path('site', 'credential.json')
const paths = () => asked.map(a => a.url)
const SITE_LEAVE = 'https://hq.acme.example/api/v1/sites/leave'
const HOST_LEAVE = 'https://hq.acme.example/api/v1/hosts/leave'
const noticeFile = () => m.ctx.state.path('link', 'leaving.json')

async function managedSite(): Promise<string> {
  await controllerOperation(m.ctx, { op: 'install', target: 'site', version: '0.2.0' }, fleetAdmin, readPin(m.ctx.state)!)
  return (JSON.parse(fs.readFileSync(credentialFile(), 'utf8')) as { credential: string }).credential
}

beforeEach(async () => {
  m = fakeMachine()
  asked = []
  answer = status(200)
  const fleetConsole = await FakeConsole.make()
  m.ctx.link = { start: () => {}, stop: () => {}, connected: () => false, sendEnvelope: () => {} }
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: MACHINE_CREDENTIAL, pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
})
afterEach(() => m.cleanup())

describe('a machine that disconnects itself tells HQ it left @SC-849', () => {
  it('at once when HQ answers: the site with its own credential, the machine with its own, and then forgets both', async () => {
    const credential = await managedSite()
    const r = await disconnectConsole(m.ctx, post)
    expect(r).toEqual({ machine: 'hq-box', siteName: 'hq-box', hq: 'told' })
    expect(paths()).toEqual([SITE_LEAVE, HOST_LEAVE])
    expect(asked.map(a => a.init.method)).toEqual(['POST', 'POST'])
    expect(asked[0].init.headers).toEqual({ Authorization: `Bearer ${credential}` })
    expect(asked[1].init.headers).toEqual({ Authorization: `Bearer ${MACHINE_CREDENTIAL}` })
    expect(fs.existsSync(noticeFile())).toBe(false)
    expect(fs.existsSync(credentialFile())).toBe(false)
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('keeps a one-use notice, readable by the owner only, when HQ does not answer; the pin is gone all the same', async () => {
    const credential = await managedSite()
    answer = unreachable
    const r = await disconnectConsole(m.ctx, post)
    expect(r.hq).toBe('notYet')
    expect(readPin(m.ctx.state)).toBeNull()
    expect(readLeavingNotice(m.ctx.state)).toMatchObject({
      hqAddress: 'https://hq.acme.example', machineCredential: MACHINE_CREDENTIAL, site: { credential, name: 'hq-box' },
    })
    expect(fs.statSync(noticeFile()).mode & 0o777).toBe(0o600)
  })

  it('takes the credential away from the stopped site, so it cannot connect again if it is started', async () => {
    const credential = await managedSite()
    answer = unreachable
    await disconnectConsole(m.ctx, post)
    expect(fs.existsSync(credentialFile())).toBe(false)
    expect(fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8')).not.toContain(credential)
  })

  it('delivers the notice once HQ answers again, then deletes it', async () => {
    await managedSite()
    answer = unreachable
    await disconnectConsole(m.ctx, post)
    expect(await deliverLeaving(m.ctx.state, post)).toEqual({ site: 'kept', machine: 'kept' })
    answer = status(503)
    expect(await deliverLeaving(m.ctx.state, post)).toEqual({ site: 'kept', machine: 'kept' })
    expect(readLeavingNotice(m.ctx.state)).not.toBeNull()
    answer = status(200)
    expect(await deliverLeaving(m.ctx.state, post)).toEqual({ site: 'told', machine: 'told' })
    expect(fs.existsSync(noticeFile())).toBe(false)
    expect(await deliverLeaving(m.ctx.state, post)).toBe('none')
    expect(asked).toHaveLength(8)
  })

  it('drops the notice when HQ no longer knows the credential: a fleet admin removed the site first', async () => {
    await managedSite()
    answer = status(401)
    expect((await disconnectConsole(m.ctx, post)).hq).toBe('alreadyRemoved')
    expect(fs.existsSync(noticeFile())).toBe(false)
  })

  it('is delivered by the host service’s own loop', async () => {
    await managedSite()
    answer = unreachable
    await disconnectConsole(m.ctx, post)
    answer = status(200)
    const lines: string[] = []
    const stop = startLeavingNotices(m.ctx.state, 60_000, line => lines.push(line), post)
    await new Promise(resolve => setTimeout(resolve, 10))
    stop()
    expect(fs.existsSync(noticeFile())).toBe(false)
    expect(lines.join('\n')).toContain('HQ was told this machine left')
  })


  it('is not written when HQ’s revoke forgets the Fleet Console: the fleet admin removed it', async () => {
    await managedSite()
    await forgetConsole(m.ctx)
    expect(fs.existsSync(noticeFile())).toBe(false)
  })

  it('never leaves with a credential a move released to another machine', async () => {
    await managedSite()
    const installedAt = (m.ctx.state.readJson('site', 'settings.json') as { installedAt: string }).installedAt
    writeSend(m.ctx.state, {
      transferId: 't1', peer: 'new-box', peerIdentity: { role: 'host', signingKey: 'a', sealingKey: 'b' } as never, phase: 'released',
      releasedAt: 1, deadline: 2, reason: null, target: 'site', installedAt,
    } as never)
    expect(await disconnectConsole(m.ctx, post)).toEqual({ machine: 'hq-box', siteName: null, hq: 'told' })
    expect(paths()).toEqual([HOST_LEAVE])
  })

  it('leaves with the credential of a site added after an earlier one moved away', async () => {
    await managedSite()
    writeSend(m.ctx.state, {
      transferId: 't1', peer: 'new-box', peerIdentity: { role: 'host', signingKey: 'a', sealingKey: 'b' } as never, phase: 'removed',
      releasedAt: 1, deadline: 2, reason: null, target: 'site', installedAt: '2026-10-01T00:00:00.000Z',
    } as never)
    expect(await disconnectConsole(m.ctx, post)).toEqual({ machine: 'hq-box', siteName: 'hq-box', hq: 'told' })
    expect(paths()).toEqual([SITE_LEAVE, HOST_LEAVE])
  })

  it('never leaves with the credential of a site still moving here', async () => {
    await managedSite()
    writeReceive(m.ctx.state, { phase: 'starting' } as never)
    expect(await disconnectConsole(m.ctx, post)).toEqual({ machine: 'hq-box', siteName: null, hq: 'told' })
    expect(paths()).toEqual([HOST_LEAVE])
  })
})

describe('what the machine admin reads after disconnecting @SC-849', () => {
  it('says HQ was told, or that it is told once it answers', () => {
    expect(disconnected({ machine: 'b', siteName: 'office-server', hq: 'told' }).replace(/\s+/g, ' '))
      .toContain('HQ was told it left: the site office-server no longer takes part, and fleet admins are asked to remove this machine in the Fleet Console.')
    expect(disconnected({ machine: 'b', siteName: 'office-server', hq: 'notYet' }).replace(/\s+/g, ' '))
      .toContain('this machine tells it as soon as HQ answers again.')
    expect(disconnected({ machine: 'b', siteName: null, hq: null }).replace(/\s+/g, ' ')).toBe('Disconnected. This machine dropped its credential and no longer answers the Fleet Console.')
    expect(disconnected({ machine: 'b', siteName: null, hq: 'told' }).replace(/\s+/g, ' '))
      .toContain('HQ was told it left: fleet admins are asked to remove this machine in the Fleet Console.')
    expect(disconnected({ machine: 'b', siteName: null, hq: 'notYet' }).replace(/\s+/g, ' '))
      .toContain('Until then HQ lists this machine as not heard from.')
  })
})

describe('wherever HQ moved, and whatever the machine carries @SC-849', () => {
  it('goes to the address the machine’s link was using, not the site’s older record of it', async () => {
    await managedSite()
    const settings = m.ctx.state.path('site', 'settings.json')
    fs.writeFileSync(settings, JSON.stringify({ ...JSON.parse(fs.readFileSync(settings, 'utf8')), hqUrl: 'http://192.168.65.254:4100' }))
    const r = await disconnectConsole(m.ctx, post)
    expect(r.hq).toBe('told')
    expect(paths()).toEqual([SITE_LEAVE, HOST_LEAVE])
  })

  it('a machine with no site tells HQ it left with its machine credential, whose only call is the host-leave endpoint', async () => {
    const r = await disconnectConsole(m.ctx, post)
    expect(r).toEqual({ machine: 'hq-box', siteName: null, hq: 'told' })
    expect(paths()).toEqual([HOST_LEAVE])
    expect(asked[0].init.headers).toEqual({ Authorization: `Bearer ${MACHINE_CREDENTIAL}` })
    expect(fs.existsSync(noticeFile())).toBe(false)
  })

  it('a machine with no site keeps its notice while HQ does not answer, and delivers it later', async () => {
    answer = unreachable
    expect((await disconnectConsole(m.ctx, post)).hq).toBe('notYet')
    expect(readLeavingNotice(m.ctx.state)).toEqual({ hqAddress: 'https://hq.acme.example', leftAt: expect.any(String), machineCredential: MACHINE_CREDENTIAL })
    expect(fs.statSync(noticeFile()).mode & 0o777).toBe(0o600)
    answer = status(200)
    expect(await deliverLeaving(m.ctx.state, post)).toEqual({ site: null, machine: 'told' })
    expect(fs.existsSync(noticeFile())).toBe(false)
  })

  it('keeps only the part HQ has not taken yet', async () => {
    await managedSite()
    answer = async () => (asked.at(-1)!.url === SITE_LEAVE ? { status: 200, ok: true } : { status: 502, ok: false })
    expect((await disconnectConsole(m.ctx, post)).hq).toBe('notYet')
    const left = readLeavingNotice(m.ctx.state)!
    expect(left.site).toBeUndefined()
    expect(left.machineCredential).toBe(MACHINE_CREDENTIAL)
    answer = status(200)
    asked = []
    expect(await deliverLeaving(m.ctx.state, post)).toEqual({ site: null, machine: 'told' })
    expect(paths()).toEqual([HOST_LEAVE])
    expect(fs.existsSync(noticeFile())).toBe(false)
  })
})
