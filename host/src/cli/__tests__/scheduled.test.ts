import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'
import { statusText } from '../statusText'
import type { MachineStatus } from '../../status/machineStatus'

let m: FakeMachine
let out: string
let err: string
const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => null,
}
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  out = ''
  err = ''
})
afterEach(() => m.cleanup())

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => m.ctx.now())
/** Two days on from the fake machine's clock, at 02:00 in the machine's zone. */
function twoDaysOn(): Date {
  const now = m.ctx.now()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 2, 0)
}
const day = (d: Date) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} Oct`

describe('agenthix site schedule resize @SC-840', () => {
  it('schedules it, says it back in words, and lists it', async () => {
    const at = twoDaysOn()
    expect(await cli('site', 'schedule', 'resize', '--memory', '512MB', '--containers', '1', '--at', `${day(at)} 02:00`)).toBe(0)
    expect(flat(out)).toContain(`Scheduled. The site hq-box will be resized to 512 MB, 1 at once on ${day(at)} at 02:00,`)
    expect(flat(out)).toContain('HQ tells the people whose projects run there now. From 01:55 no new runs start there;')
    expect(flat(out)).toContain('To cancel before then: agenthix schedule cancel 1')
    out = ''
    expect(await cli('scheduled')).toBe(0)
    expect(out).toBe(`  1   ${day(at)} 02:00   Resize the site to 512 MB, 1 at once  scheduled here\n`)
  })

  it('refuses a time that has passed, and one it cannot read', async () => {
    expect(await cli('site', 'schedule', 'resize', '--memory', '512MB', '--at', '2020-01-01 02:00')).toBe(1)
    expect(flat(err)).toMatch(/^Not scheduled: .* has passed\./)
    err = ''
    expect(await cli('site', 'schedule', 'resize', '--memory', '512MB', '--at', 'soonish')).toBe(2)
    expect(flat(err)).toContain('Not a time this reads: "soonish".')
    expect(await cli('scheduled')).toBe(0)
    expect(out).toContain('Nothing is scheduled on hq-box.')
  })

  it('says a change it cannot schedule yet is not in this version, and asks for the time', async () => {
    expect(await cli('hq', 'schedule', 'move', '--address')).toBe(2)
    expect(flat(err)).toContain("Say when, in this machine's time, and HQ's new address if it changes: agenthix hq schedule move")
    err = ''
    expect(await cli('hq', 'schedule', 'restore', '--at', '02:00')).toBe(2)
    expect(flat(err)).toContain('This version cannot schedule a restore yet')
    err = ''
    expect(await cli('site', 'schedule', 'resize', '--memory', '512MB')).toBe(2)
    expect(flat(err)).toContain("Say when, in this machine's time:")
  })
})

describe('agenthix schedule change and cancel @SC-840', () => {
  it('moves one, then cancels it, each in words', async () => {
    const at = twoDaysOn()
    await cli('site', 'schedule', 'resize', '--memory', '512MB', '--at', `${day(at)} 02:00`)
    out = ''
    const later = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, 3, 30)
    expect(await cli('schedule', 'change', '1', '--at', `${day(later)} 03:30`)).toBe(0)
    expect(flat(out)).toContain(`Changed. The site hq-box will now be resized to 512 MB on ${day(later)} at 03:30,`)
    out = ''
    expect(await cli('schedule', 'cancel', '1')).toBe(0)
    expect(flat(out)).toBe(`Cancelled. The site hq-box will not be resized on ${day(later)}. HQ tells the people whose projects run there that it is off.`)
    expect(await cli('schedule', 'cancel', '1')).toBe(1)
    expect(flat(err)).toContain('Nothing is scheduled as 1.')
  })
})

describe('agenthix status @SC-840', () => {
  it('lists what is scheduled, and nothing when nothing is', async () => {
    const at = twoDaysOn()
    await cli('site', 'schedule', 'resize', '--memory', '512MB', '--at', `${day(at)} 02:00`)
    const status = (await send({ op: 'machine.status' }, () => {})).result as MachineStatus
    const text = statusText(status, m.ctx.now())
    expect(text).toContain(`Scheduled  1\n  1   ${day(at)} 02:00`)
    expect(statusText({ ...status, scheduled: [] }, m.ctx.now())).not.toContain('Scheduled')
  })
})
