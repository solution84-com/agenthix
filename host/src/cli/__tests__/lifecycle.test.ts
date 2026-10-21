import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { installed } from '../../service/context'
import { listScheduled } from '../../scheduled/scheduler'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string
let answers: string[]
let asked: string[]

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async prompt => { asked.push(prompt); return answers.length ? answers.shift()! : null },
}
const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => m.ctx.now())
const flat = (s: string) => s.replace(/\s+/g, ' ')

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  m.hq.status = { ok: true, text: 'HQ', data: { users: 12, hqSite: { state: 'connected', dockerRunning: true }, address: 'https://hq.acme.example', version: '0.2.0', commit: 'c' } }
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  out = ''
  err = ''
  answers = []
  asked = []
})
afterEach(() => m.cleanup())

describe('agenthix hq erase @SC-843', () => {
  it('warns what goes, what is kept and who is not told; a mistyped address erases nothing', async () => {
    answers = ['https://hq.acme.example/']
    expect(await cli('hq', 'erase')).toBe(1)
    expect(flat(out)).toContain("This erases HQ at https://hq.acme.example on hq-box: its people, projects, agents and work, and its own site, hq-box, with it.")
    expect(flat(out)).toContain('kept on hq-box for 30 days from the erase. Until then, agenthix hq restore brings everything back.')
    expect(flat(out)).toContain("12 people use this HQ. They won't be told unless you give notice.")
    expect(out).toContain('This erases HQ NOW. To give notice instead, press Ctrl-C and run:')
    expect(asked).toEqual(["To confirm, type HQ's address: "])
    expect(flat(err)).toBe("Not erased: that is not HQ's address (it is https://hq.acme.example, without the slash). Nothing changed. ")
    expect(installed(m.ctx).hq).not.toBeNull()
  })

  it('erases at once once the address is typed, with each step, and says until when it is kept', async () => {
    answers = ['https://hq.acme.example']
    expect(await cli('hq', 'erase')).toBe(0)
    expect(out).toMatch(/Taking the final sealed backup \.+ done \(/)
    expect(out).toMatch(/Removing the running data \.+ done/)
    expect(out).toContain('Erased. The backup is kept until 13 November 2026.\nTo bring HQ back before then: agenthix hq restore')
    expect(installed(m.ctx).hq).toBeNull()
  })

  it('with --on, says the countdown everyone sees, and schedules it', async () => {
    answers = ['https://hq.acme.example']
    expect(await cli('hq', 'erase', '--on', 'Fri 16 Oct 18:00')).toBe(0)
    expect(flat(out)).toContain('On Fri 16 Oct at 18:00 a final sealed backup is taken.')
    expect(flat(out)).toContain('until 15 November 2026.')
    expect(flat(out)).toContain('Notice: from now, everyone in HQ sees "This HQ will be erased on Fri 16 Oct at 18:00 by a fleet admin. Export what you need, or ask them to cancel." 12 people will see it.')
    expect(flat(out)).toContain('Scheduled. HQ will be erased on Fri 16 Oct at 18:00. The countdown is showing. To cancel before then: agenthix schedule cancel 1')
    expect(listScheduled(m.ctx)).toMatchObject([{ kind: 'erase', target: 'hq' }])
    expect(installed(m.ctx).hq).not.toBeNull()
  })

  it('is brought back with hq restore, which says how long is left and asks first', async () => {
    answers = ['https://hq.acme.example']
    await cli('hq', 'erase')
    await m.ctx.sleep(9 * 24 * 60 * 60_000)
    out = ''
    answers = ['y']
    expect(await cli('hq', 'restore')).toBe(0)
    expect(flat(out)).toContain('HQ at https://hq.acme.example was erased on 14 October 2026. Its final backup is kept for 21 more days.')
    expect(asked.pop()).toBe('Restore it on hq-box? [y/N] ')
    expect(flat(out)).toContain('Restored. HQ answers at https://hq.acme.example. Its sites reconnect by themselves.')
  })

  it('status says what was erased, until when it is kept, and how to bring it back', async () => {
    answers = ['https://hq.acme.example']
    await cli('hq', 'erase')
    out = ''
    expect(await cli('status')).toBe(0)
    expect(flat(out)).toContain('HQ erased HQ at https://hq.acme.example was erased on 14 October 2026. Its final backup is kept until 13 November 2026, then purged. To bring it back before then: agenthix hq restore')
  })
})

describe('agenthix site erase @SC-844', () => {
  it('on HQ’s machine says the site goes only with HQ, and asks nothing', async () => {
    expect(await cli('site', 'erase')).toBe(1)
    expect(flat(err)).toContain('carries HQ here, so it is erased only with HQ: agenthix hq erase')
    expect(asked).toEqual([])
  })

  it('on its own machine asks for the site’s name, and a wrong one erases nothing', async () => {
    fs.rmSync(m.ctx.state.path('hq'), { recursive: true })
    answers = ['Office']
    expect(await cli('site', 'erase')).toBe(1)
    expect(flat(out)).toContain('This erases the site hq-box from hq-box now.')
    expect(flat(err)).toContain("Not erased: that is not the site's name. Nothing changed.")
    answers = ['hq-box']
    expect(await cli('site', 'erase')).toBe(0)
    expect(flat(out)).toContain('Erased here. HQ did not answer, so it still lists hq-box as not connected.')
  })
})

describe('agenthix hq|site suspend and resume @SC-842', () => {
  it('suspends now, and resumes', async () => {
    expect(await cli('hq', 'suspend')).toBe(0)
    expect(flat(out)).toContain('Suspended. HQ and its site are stopped; nothing is lost')
    out = ''
    expect(await cli('hq', 'resume')).toBe(0)
    expect(flat(out)).toContain('Resumed. HQ and its site are starting again.')
  })

  it('suspends later with --at, or with schedule', async () => {
    expect(await cli('site', 'suspend', '--at', 'tomorrow 02:00')).toBe(0)
    expect(flat(out)).toContain('Scheduled. The site hq-box will be suspended on')
    expect(await cli('site', 'schedule', 'resume', '--at', 'tomorrow 03:00')).toBe(0)
    expect(listScheduled(m.ctx).map(c => c.kind)).toEqual(['suspend', 'resume'])
  })

  it('refuses what it cannot read', () => {
    expect(parseCommand(['hq', 'suspend', '--on', 'x'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['site', 'erase', '--on', 'x'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['site', 'schedule', 'erase', '--at', 'x'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['hq', 'schedule', 'erase', '--at', 'Fri 16 Oct 18:00'])).toEqual({ kind: 'erase', target: 'hq', on: 'Fri 16 Oct 18:00' })
  })
})
