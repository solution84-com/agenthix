import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => null,
}

beforeEach(async () => {
  m = fakeMachine()
  out = ''
  err = ''
  m.ctx.portInUse = async () => false
  m.ctx.frontDoorProbes = { certificate: async () => ({ ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }) }
  m.ctx.previewProbes = {
    resolve: async () => ['203.0.113.7'],
    checkAnswer: async () => ({ ok: true }),
  }
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
})
afterEach(() => m.cleanup())

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0')
const flat = (s: string) => s.replace(/\s+/g, ' ')
const hqEnv = () => {
  const compose = JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')) as { services: Record<string, { environment: Record<string, string> }> }
  return compose.services['hq-server']!.environment
}

describe('agenthix front-door on --previews @SC-1756', () => {
  it('reads the preview address beside the files host', () => {
    expect(parseCommand(['front-door', 'on', '--previews', 'preview.acme-apps.net', '--take-ports-80-and-443']))
      .toEqual({ kind: 'frontDoor', action: 'on', takePorts: true, previewsHost: 'preview.acme-apps.net' })
    expect(parseCommand(['front-door', 'on', '--previews']).kind).toBe('usage')
    expect(parseCommand(['front-door', 'off', '--previews', 'preview.acme-apps.net']).kind).toBe('usage')
  })

  it('turns the front door on with live apps at the address, runs its three checks, and says so', async () => {
    expect(await cli('front-door', 'on', '--previews', 'Preview.Acme-Apps.net', '--take-ports-80-and-443')).toBe(0)
    expect(hqEnv().PREVIEW_PATTERN).toBe('https://p-{id}.preview.acme-apps.net')
    expect(out).toMatch(/DNS for \*\.preview\.acme-apps\.net \.+ passes/)
    expect(out).toMatch(/A test app at p-check\.preview\.acme-apps\.net \.+ passes/)
    expect(flat(out)).toContain('Live apps open at their own address under preview.acme-apps.net.')
  })

  it('is refused, before anything is asked or changed, with an address a preview address cannot be', async () => {
    for (const bad of ['hq.acme.example', 'files.hq.acme.example', 'not a domain']) {
      err = ''
      expect(await cli('front-door', 'on', '--previews', bad, '--take-ports-80-and-443')).toBe(1)
      expect(flat(err)).toMatch(/The preview address cannot be .*Nothing (was )?changed\./)
    }
    expect(m.up.has('agenthix-front-door')).toBe(false)
    expect(hqEnv().PREVIEW_PATTERN).toBe('')
  })
})
