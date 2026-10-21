import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { backupLines } from '../backupWords'
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
const sendTo = (machine: FakeMachine): Send => (request, onProgress) => ownerHandler(machine.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cliOn = (machine: FakeMachine, ...argv: string[]) => runCommand(parseCommand(argv), sendTo(machine), io, '0.2.0')
const cli = (...argv: string[]) => cliOn(m, ...argv)
const flat = (s: string) => s.replace(/\s+/g, ' ')

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  fs.mkdirSync(m.backups.onMachine('/mnt/nas/agenthix'), { recursive: true })
  out = ''
  err = ''
  answers = []
  asked = []
})
afterEach(() => m.cleanup())

describe('agenthix backup location @SC-829', () => {
  it('says when none is set, and what to run', async () => {
    expect(await cli('backup', 'location')).toBe(0)
    expect(flat(out)).toContain('Backup location for hq-box: not set. Nightly backups (02:00) are kept on this machine only. No export has been made. To choose a folder: agenthix backup location <path>')
  })

  it('tests the folder, shows the key once, and sets it only when the person has stored it', async () => {
    answers = ['n', 'y']
    expect(await cli('backup', 'location', '/mnt/nas/agenthix')).toBe(0)
    expect(out).toMatch(/Testing that this machine can write there \.+ passes/)
    expect(flat(out)).toContain('This site carries HQ, so each nightly backup holds HQ too')
    expect(out).toMatch(/ {2}Key: [0-9A-Z]{4}(-[0-9A-Z]{4}){5}\n/)
    expect(asked).toEqual(['Save it to a file instead? [y/N] ', 'Have you stored the key? [y/N] '])
    expect(out.trim().endsWith('Set.')).toBe(true)
  })

  it('sets nothing when the key was not stored, or the folder fails the test', async () => {
    answers = ['n', 'n']
    expect(await cli('backup', 'location', '/mnt/nas/agenthix')).toBe(1)
    expect(out.trim().endsWith('Not set. Nothing changed.')).toBe(true)
    out = ''
    expect(await cli('backup', 'location', '/mnt/nas/agenthix-2')).toBe(1)
    expect(out).toMatch(/Testing that this machine can write there \.+ fails/)
    expect(flat(err)).toContain('/mnt/nas/agenthix-2 does not exist on hq-box. Not set. Nothing changed. Check the folder is mounted, then run this again.')
    expect(asked).toEqual(['Save it to a file instead? [y/N] ', 'Have you stored the key? [y/N] '])
  })
})

describe('agenthix restore --from @SC-833', () => {
  it('on a new machine: lists the nights, takes the key, checks it, and brings HQ back', async () => {
    answers = ['n', 'y']
    await cli('backup', 'location', '/mnt/nas/agenthix')
    const key = /Key: (\S+)/.exec(out)![1]
    m.ctx.now = () => new Date(2026, 9, 14, 2, 0)
    await cli('backup')
    const fresh = fakeMachine()
    fresh.ctx.machine.name = 'hq-box-2'
    fs.cpSync(m.backups.onMachine('/mnt/nas'), fresh.backups.onMachine('/mnt/nas'), { recursive: true })
    out = ''
    answers = ['1', key, 'y']
    expect(await cliOn(fresh, 'restore', '--from', '/mnt/nas/agenthix')).toBe(0)
    const said = flat(out)
    expect(said).toContain('Looking in /mnt/nas/agenthix ...')
    expect(said).toContain('Backups of hq-box (HQ and its site hq-box), newest first:')
    expect(said).toMatch(/1 +night of 13 October 2026, 02:00 +\d+ KB/)
    expect(asked.slice(-3)).toEqual(['Which night? [1] ', 'The key for these copies: ', 'Restore? [y/N] '])
    expect(out).toMatch(/Checking the key \.+ passes/)
    expect(said).toContain('This brings back on hq-box-2: HQ at https://hq.acme.example, its site hq-box')
    expect(out).toMatch(/Restoring HQ's database \.+ done/)
    expect(said).toContain('Restored. HQ answers on this machine once https://hq.acme.example points at it.')
    expect(said).toContain('Files changed after 02:00 on 14 October were lost with the machine.')
    fresh.cleanup()
  })

  it('refuses where HQ already runs', async () => {
    expect(await cli('restore', '--from', '/mnt/nas/agenthix')).toBe(1)
    expect(flat(err)).toContain('Not restored: HQ already runs on hq-box.')
  })
})

describe('the backup lines in status @SC-832', () => {
  const now = new Date(2026, 9, 13, 9, 0)
  const base = { time: { hour: 2, minute: 0 }, carriesHq: true, copy: null, location: null, lastExportAt: null }

  it('says when the last backup was, and where its copy went', () => {
    const at = new Date(2026, 9, 13, 2, 0).toISOString()
    const lines = backupLines({ ...base, last: { at, ok: true, sizeBytes: 1.2e9 }, location: { path: '/mnt/nas/agenthix', setAt: at },
      copy: { at: new Date(2026, 9, 13, 2, 6).toISOString(), ok: true, path: '/mnt/nas/agenthix' } }, now)
    expect(lines).toEqual([
      '  Last backup: 02:00 last night, 1.2 GB, sealed (HQ included).',
      '  Copied to the backup location /mnt/nas/agenthix at 02:06 last night.',
    ])
  })

  it('says plainly when the backups would die with the machine', () => {
    const lines = backupLines({ ...base, carriesHq: false, last: { at: new Date(2026, 9, 13, 2, 0).toISOString(), ok: true, sizeBytes: 4e8 },
      lastExportAt: new Date(2026, 8, 20, 9, 0).toISOString() }, now)
    expect(flat(lines.join('\n')).trim()).toBe(flat(`Last backup: 02:00 last night, 0.4 GB, sealed. Kept on this machine only.
      No backup location is set. If this machine is lost, so is this backup. The last export was 23 days ago. To choose a
      folder for copies: agenthix backup location <path>`))
  })
})
