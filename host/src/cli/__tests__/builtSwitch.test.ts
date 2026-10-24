import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { parseOwnerRequest } from '../../owner/requests'
import { readSwitch } from '../../launcher/journal'
import { NEW_IMAGE, OLD_IMAGE } from '../../launcher/__tests__/fakeContainers'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string
let answers: (string | null)[]

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => (answers.length ? answers.shift()! : null),
}
const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, 'dev', () => m.ctx.now())
const flat = (s: string) => s.replace(/\s+/g, ' ')
const BUILT = 'agenthix-host:b'

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.ctx.machine.hostServiceVersion = 'dev'
  m.containers.refs.set(BUILT, NEW_IMAGE)
  m.checked.length = 0
  out = ''
  err = ''
  answers = []
})
afterEach(() => m.cleanup())

describe('agenthix upgrades host --image, on a development build @SC-838 @SC-1274', () => {
  it('says it is a development build, asks, then starts the launcher for the image built here, unchecked', async () => {
    answers = ['y']
    expect(await cli('upgrades', 'host', '--image', BUILT)).toBe(0)
    const said = flat(out)
    expect(said).toContain(`This host service is a development build, so it switches to an image built on this machine, ${BUILT}, with no signature or version to check.`)
    expect(said).toContain('if the new one does not answer within 3 minutes, this one is started again as it was')
    expect(said).toContain('The launcher is switching it now')
    expect(m.checked).toEqual([])
    expect(m.containers.byName('agenthix-host-launcher')!.command).toEqual(['node', '--enable-source-maps', '/app/dist/launcher.js', 'swap', NEW_IMAGE])
    expect(readSwitch(m.ctx.state)).toMatchObject({ from: 'dev', to: 'dev', ref: BUILT, imageId: NEW_IMAGE, checked: false, built: true, phase: 'ready' })
  })

  it('changes nothing when the person says no', async () => {
    answers = ['n']
    expect(await cli('upgrades', 'host', '--image', BUILT)).toBe(1)
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
    expect(readSwitch(m.ctx.state)).toBeNull()
  })

  it('is refused on a published host service, which switches only forward to a signed image @SC-1275', async () => {
    m.ctx.machine.hostServiceVersion = '0.2.0'
    expect(await cli('upgrades', 'host', '--image', BUILT, '--yes')).toBe(1)
    expect(flat(err)).toContain('This host service is 0.2.0, a published version: it switches only forward')
    const answer = await ownerHandler(m.ctx)({ op: 'upgrades.hostSwitch', built: BUILT }, () => {})
    expect(answer).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('published version') } })
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
  })

  it('refuses a published image, one not on this machine, and the one already running', async () => {
    m.containers.refs.set('ghcr.io/solution84-com/agenthix-host:0.3.0', NEW_IMAGE)
    expect(await cli('upgrades', 'host', '--image', 'ghcr.io/solution84-com/agenthix-host:0.3.0', '--yes')).toBe(1)
    expect(flat(err)).toContain('is a published image')
    err = ''
    expect(await cli('upgrades', 'host', '--image', 'agenthix-host:none', '--yes')).toBe(1)
    expect(flat(err)).toContain('The image agenthix-host:none is not on this machine')
    err = ''
    expect(await cli('upgrades', 'host', '--image', OLD_IMAGE, '--yes')).toBe(1)
    expect(flat(err)).toContain('already runs')
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
    expect(readSwitch(m.ctx.state)).toBeNull()
  })

  it('prints the two commands, by the image’s id, when the launcher is off', async () => {
    await cli('upgrades', 'host', '--launcher', 'off')
    out = ''
    expect(await cli('upgrades', 'host', '--image', BUILT)).toBe(0)
    expect(out).toContain('  docker rm -f agenthix-host\n')
    expect(out).toMatch(new RegExp(`  docker run -d --name agenthix-host .* ${NEW_IMAGE}\\n`))
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
    const answer = await ownerHandler(m.ctx)({ op: 'upgrades.hostSwitch', built: BUILT }, () => {})
    expect(answer).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('launcher is off') } })
  })

  it('takes a local name or id alone, never with a version or --launcher', async () => {
    expect(parseOwnerRequest({ op: 'upgrades.hostSwitch', built: BUILT })).toEqual({ ok: true, request: { op: 'upgrades.hostSwitch', built: BUILT } })
    expect(parseOwnerRequest({ op: 'upgrades.hostSwitch', built: BUILT, version: '0.3.0' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'upgrades.hostService', built: '--rm' })).toMatchObject({ ok: false })
    expect(await cli('upgrades', 'host', '--image', BUILT, '--launcher', 'on')).toBe(2)
  })

  it('without --image, says how a development build is switched', async () => {
    const answer = await ownerHandler(m.ctx)({ op: 'upgrades.hostSwitch' }, () => {})
    expect(answer).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('agenthix upgrades host --image') } })
  })
})
