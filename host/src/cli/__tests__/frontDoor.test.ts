import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { HELP, parseCommand } from '../commands'
import { helpText, installDone } from '../messages'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string
let answers: (string | null)[]
let busy: Set<number>

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => (answers.length ? answers.shift()! : null),
}

beforeEach(async () => {
  m = fakeMachine()
  out = ''
  err = ''
  answers = []
  busy = new Set()
  m.ctx.frontDoorProbes = {
    portInUse: async port => busy.has(port),
    certificate: async () => ({ ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }),
  }
  await install(m.ctx, 'https://hq.acme.example', () => {})
})
afterEach(() => m.cleanup())

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0')
const flat = (s: string) => s.replace(/\s+/g, ' ')
const frontDoorUp = () => m.up.has('agenthix-front-door')

describe('agenthix front-door @SC-857', () => {
  it('is a row of help, and reads on, off, its flag and a files host', () => {
    expect(HELP.find(r => r.usage === 'front-door [on | off]')?.does).toBe('Show or change the web front door')
    expect(flat(helpText('0.2.0'))).toContain('front-door [on | off] Show or change the web front door')
    expect(parseCommand(['front-door'])).toEqual({ kind: 'frontDoor', action: 'show', takePorts: false })
    expect(parseCommand(['front-door', 'on', '--take-ports-80-and-443', '--files', 'f.acme.example']))
      .toEqual({ kind: 'frontDoor', action: 'on', takePorts: true, filesHost: 'f.acme.example' })
    expect(parseCommand(['front-door', 'off', 'now']).kind).toBe('usage')
    expect(parseCommand(['front-door', 'sideways']).kind).toBe('usage')
  })

  it('warns that it takes ports 80 and 443, defaults to no, and changes nothing', async () => {
    answers = ['']
    expect(await cli('front-door', 'on')).toBe(1)
    const said = flat(out)
    expect(said).toContain('The front door serves HQ at https://hq.acme.example itself, with certificates it gets and renews on its own.')
    expect(said).toContain('It takes ports 80 and 443 on hq-box. While it is on, nothing else on this machine can serve web traffic on them')
    expect(said).toContain('Uploaded files get their own address, files.hq.acme.example. Point its DNS name at hq-box too before going on.')
    expect(said).toContain('Left off. Nothing changed.')
    expect(frontDoorUp()).toBe(false)
  })

  it('from a script, needs its flag', async () => {
    expect(await cli('front-door', 'on')).toBe(1)
    expect(flat(err)).toContain('Not on: this needs an answer and there is no one to ask. From a script, add --take-ports-80-and-443. Nothing changed.')
    expect(frontDoorUp()).toBe(false)
    expect(await cli('front-door', 'on', '--take-ports-80-and-443')).toBe(0)
    expect(frontDoorUp()).toBe(true)
  })

  it('says yes, checks, gets both certificates, and says what it serves', async () => {
    answers = ['y']
    expect(await cli('front-door', 'on')).toBe(0)
    expect(out).toMatch(/Checking the configuration \.+ passes/)
    expect(out).toMatch(/Certificate for hq\.acme\.example \.+ obtained/)
    expect(out).toMatch(/Certificate for files\.hq\.acme\.example \.+ obtained/)
    expect(flat(out)).toContain('The front door is on. It serves HQ at https://hq.acme.example and uploaded files at https://files.hq.acme.example')
    out = ''
    expect(await cli('status')).toBe(0)
    expect(flat(out)).toContain('Front door on Serves hq.acme.example and files.hq.acme.example on ports 80 and 443')
  })

  it('refuses at once, without asking, while a port is in use', async () => {
    busy.add(443)
    answers = ['y']
    expect(await cli('front-door', 'on')).toBe(1)
    expect(flat(err)).toContain('Refused: something on hq-box is already listening on port 443.')
    expect(flat(err)).toContain('agenthix front-door prints the steps. Nothing changed.')
    expect(answers).toEqual(['y'])
    expect(out).not.toContain('It takes ports 80 and 443')
  })

  it('with nothing after it, prints the steps for a web server of the machine’s own', async () => {
    expect(await cli('front-door')).toBe(0)
    const said = flat(out)
    expect(said).toContain('Front door off')
    expect(said).toContain("point this machine's web server at 127.0.0.1:4100, for https://hq.acme.example and for https://files.hq.acme.example")
    expect(said).toContain('agenthix front-door on')
  })

  it('off frees the ports and says what that means', async () => {
    await cli('front-door', 'on', '--take-ports-80-and-443')
    out = ''
    expect(await cli('front-door', 'off')).toBe(0)
    expect(frontDoorUp()).toBe(false)
    expect(flat(out)).toContain('The front door is off, and ports 80 and 443 are free.')
  })
})

describe('the end of install, about the front door and uploaded files @SC-857', () => {
  const result = { listen: { bind: '127.0.0.1', port: 4100 }, siteName: 'hq-box', siteConnected: true, users: 0, firstAccountLink: null }

  it('with a domain, names the files host beside HQ, and offers the front door', () => {
    const said = flat(installDone({ ...result, address: 'https://hq.acme.example' }, 'hq-box'))
    expect(said).toContain('and https://files.hq.acme.example, where uploaded files are served, at the same place')
    expect(said).toContain('Or let Agenthix take ports 80 and 443 for it: agenthix front-door on')
  })

  it('on a bare network address, says uploads are downloads only', () => {
    const said = flat(installDone({ ...result, address: 'http://192.168.1.20:4100', listen: { bind: '0.0.0.0', port: 4100 } }, 'hq-box'))
    expect(said).toContain('uploaded files are offered only as downloads')
  })

  it('at a network address over plain http, says voice and dictation need https or localhost @SC-1164', () => {
    const said = flat(installDone({ ...result, address: 'http://192.168.1.20:4100', listen: { bind: '0.0.0.0', port: 4100 } }, 'hq-box'))
    expect(said).toContain('Voice and dictation do not work at this address: a browser gives the microphone only to a page on https')
    expect(said).toContain('agenthix front-door on')
    expect(said).toContain('or to HQ installed at localhost and opened on its own machine.')
  })

  it('at localhost, says nothing about voice: the page there is secure @SC-1164', () => {
    expect(flat(installDone({ ...result, address: 'http://localhost:4100' }, 'hq-box'))).not.toContain('Voice and dictation')
  })
})
