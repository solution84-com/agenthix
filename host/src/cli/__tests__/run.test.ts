import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string
let answers: (string | null)[]
let asked: string[]

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async prompt => { asked.push(prompt); return answers.length ? answers.shift()! : null },
}

beforeEach(() => {
  m = fakeMachine()
  out = ''
  err = ''
  answers = []
  asked = []
})
afterEach(() => m.cleanup())

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0')
const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('agenthix install', () => {
  it('asks its one question, takes the bracketed answer on Enter, and ends with the shortcut and one link @SC-816', async () => {
    answers = ['']
    expect(await cli('install')).toBe(0)
    expect(asked).toEqual(['[http://localhost:7800] '])
    const said = flat(out)
    expect(said).toContain('Agenthix 0.2.0 — installing on hq-box.')
    expect(said).toContain("Where will people open HQ, the organisation's own Agenthix?")
    expect(said).toContain('people on other computers cannot open http://localhost:7800')
    expect(said).toContain('HQ always comes with a site, hq-box, where agents work; nothing to ask.')
    expect(out).toMatch(/Starting HQ \.+ answers/)
    expect(out).toMatch(/Starting the site hq-box \(private Docker network\) \.+ connected to HQ/)
    expect(out).toContain(`printf '#!/bin/sh\\nexec docker exec -it agenthix-host agenthix "$@"\\n' | sudo tee /usr/local/bin/agenthix`)
    expect(said).toContain('Installed. HQ runs on hq-box, carried by its site, hq-box.')
    expect(out.match(/https:\/\/hq\.acme\.example\/setup\?token=abc/g)).toHaveLength(1)
    expect(said).toContain('agenthix hq invite-admin makes a new one.')
  })

  it('asks again when the answer is not an address @SC-816', async () => {
    answers = ['hq.acme.example', 'https://hq.acme.example']
    expect(await cli('install')).toBe(0)
    expect(asked).toHaveLength(2)
    expect(flat(err)).toContain('HQ cannot be at hq.acme.example: it must start with http:// or https://.')
    expect(flat(out)).toContain('point this machine\'s web server at 127.0.0.1:7800')
  })

  it('refuses a given address that is not an address, in words, without blaming the host service', async () => {
    expect(await cli('install', '--address', 'http://:7500', '--yes')).toBe(1)
    expect(flat(err)).toContain('HQ cannot be at http://:7500: it is not an address a browser can open. Nothing was changed.')
    expect(err).not.toContain('not answering')
  })

  it('refuses an empty --address as a usage error rather than taking the default', async () => {
    expect(await cli('install', '--address', '', '--yes')).toBe(2)
    expect(flat(err)).toContain('install --address needs an address')
  })

  it('asks nothing once HQ is installed @SC-816', async () => {
    await cli('install', '--address', 'https://hq.acme.example')
    out = ''
    asked = []
    expect(await cli('install')).toBe(0)
    expect(asked).toEqual([])
    expect(flat(out)).toContain('HQ is already installed here, at https://hq.acme.example.')
  })

  it('stops, saying how to answer, when there is no one to ask @SC-816', async () => {
    expect(await cli('install')).toBe(1)
    expect(flat(err)).toContain('--address <address>')
  })
})

describe('the machine’s way into hq @SC-860', () => {
  beforeEach(async () => {
    await cli('install', '--address', 'https://hq.acme.example')
    out = ''
  })

  it('prints a first-account link on a fresh install, without asking', async () => {
    expect(await cli('hq', 'invite-admin')).toBe(0)
    expect(asked).toEqual([])
    expect(flat(out)).toContain('HQ at https://hq.acme.example has no account yet.')
  })

  it('asks before making an admin invitation once HQ has people, and makes none on no', async () => {
    m.hq.status = { ok: true, text: '', data: { users: 3, hqSite: { state: 'connected', dockerRunning: true }, address: 'x', version: 'dev', commit: 'c' } }
    answers = ['n']
    const asksBefore = m.calls.filter(c => c.includes('invite-admin')).length
    expect(await cli('hq', 'invite-admin')).toBe(1)
    expect(asked).toEqual(['Make it? [y/N] '])
    expect(flat(out)).toContain('This is for when no organisation admin can sign in.')
    expect(m.calls.filter(c => c.includes('invite-admin')).length).toBe(asksBefore)
  })

  it('says who to give a reset link to, and who was told', async () => {
    m.hq['reset-password'] = {
      ok: true,
      text: 'ignored: the CLI words it from the data',
      data: {
        kind: 'password_reset', link: 'https://hq.acme.example/reset?token=7d0a', validHours: 1,
        person: { name: 'Avery Chen', handle: 'avery' }, toldAdmins: ['Sam Rivera'],
      },
    }
    expect(await cli('hq', 'reset-password', 'avery')).toBe(0)
    expect(flat(out)).toContain('A one-time link for Avery Chen to set a new password. It works once, for 1 hour: https://hq.acme.example/reset?token=7d0a')
    expect(flat(out)).toContain('HQ does not send it')
    expect(flat(out)).toContain('Sam Rivera has been told')
    expect(flat(out)).not.toContain('ignored')
  })

  it('names who was told of an admin invitation, from the data', async () => {
    m.hq.status = { ok: true, text: '', data: { users: 3, hqSite: { state: 'connected', dockerRunning: true }, address: 'x', version: 'dev', commit: 'c' } }
    m.hq['invite-admin'] = {
      ok: true,
      text: 'ignored',
      data: { kind: 'invitation', link: 'https://hq.acme.example/invite/k1', validHours: 24, toldAdmins: ['Sam Rivera', 'Avery Chen'] },
    }
    answers = ['y']
    expect(await cli('hq', 'invite-admin')).toBe(0)
    expect(flat(out)).toContain('https://hq.acme.example/invite/k1')
    expect(flat(out)).toContain('Sam Rivera and Avery Chen have been told.')
  })

  it('reads a refusal by its code, not by its words', async () => {
    m.hq['reset-password'] = { ok: false, error: 'Words that may change.', code: 'not_found' }
    expect(await cli('hq', 'reset-password', 'avry')).toBe(1)
    expect(flat(err)).toContain('Not found: no one signs in to HQ as "avry"')
  })

  it('words a mistyped name as the board does', async () => {
    m.hq['reset-password'] = { ok: false, error: "No one signs in as 'avry'.", code: 'not_found' }
    expect(await cli('hq', 'reset-password', 'avry')).toBe(1)
    expect(flat(err)).toContain('Not found: no one signs in to HQ as "avry". Use the name they type at sign-in')
  })
})

describe('the CLI around its commands @SC-823', () => {
  it('lists only the commands it has, grouped, with the docker exec form', async () => {
    expect(await cli('help')).toBe(0)
    expect(out).toContain('agenthix 0.2.0 — runs Agenthix on this machine.')
    expect(out).toContain('Without the shortcut, type: docker exec -it agenthix-host agenthix <command>')
    for (const c of ['install', 'status', 'hq invite-admin', 'hq reset-password <user>', 'hq logs', 'site logs']) expect(out).toContain(c)
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(80)
  })

  it('uses the screens\' words: planned maintenance, not scheduled changes; the site takes the new machine\'s name', async () => {
    expect(await cli('help', 'site schedule')).toBe(0)
    expect(flat(out)).not.toContain('It keeps its name')
    out = ''
    expect(await cli('help')).toBe(0)
    expect(out).not.toContain('scheduled change')
    expect(out).not.toContain('Fleet →')
  })

  it('refuses a command it does not have, pointing at help', async () => {
    expect(await cli('rm', '-rf')).toBe(2)
    expect(err).toContain('agenthix help lists every command.')
  })

  it('prints the machine’s status in sentences', async () => {
    expect(await cli('status')).toBe(0)
    expect(flat(out)).toContain('Nothing runs here yet.')
  })

  it('says how to restart the host service when it does not answer', async () => {
    const down: Send = () => Promise.reject(Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' }))
    expect(await runCommand(parseCommand(['status']), down, io, '0.2.0')).toBe(3)
    expect(err).toContain('docker restart agenthix-host')
  })
})
