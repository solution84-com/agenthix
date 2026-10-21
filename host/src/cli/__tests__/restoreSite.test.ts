import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ownerHandler } from '../../owner/dispatch'
import { readPin } from '../../link/pin'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'
import { ADDRESS, CODE, LOCATION, lostSite, until, type LostSite } from '../../backups/__tests__/lostSite'

let t: LostSite
let out: string
let err: string
let answers: string[]
let asked: string[]

const io: Io = {
  out: s => { out += `${s}\n` },
  write: s => { out += s },
  err: s => { err += `${s}\n` },
  ask: async prompt => { asked.push(prompt); return answers.length ? answers.shift()! : null },
}
const flat = (s: string) => s.replace(/\s+/g, ' ')

beforeEach(async () => {
  t = await lostSite()
  out = ''
  err = ''
  answers = []
  asked = []
})
afterEach(() => t.cleanup())

const send: Send = (request, onProgress) => ownerHandler(t.fresh.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0')

describe('agenthix restore --from <folder or file> <hq address> <code> @SC-834', () => {
  it('warns before it restores, joins with the code, and says the site took the lost machine’s place', async () => {
    answers = ['1', t.key, 'y']
    const running = cli('restore', '--from', LOCATION, ADDRESS, CODE)
    await until(() => readPin(t.fresh.ctx.state) !== null)
    expect(await t.askForRestore()).toMatchObject({ ok: true })
    expect(await running).toBe(0)
    const said = flat(out)
    expect(asked).toEqual(['Which night? [1] ', 'The key for these copies: ', 'Restore? [y/N] '])
    expect(said).toContain('This brings back on new-server the site office-server, as it was on the night of')
    expect(said).toContain('in place of the machine it ran on. It is named new-server from then on.')
    expect(said).toContain("Before you go on: office-server's machine may only be down for a while. Restoring here replaces it — if it comes back, HQ refuses it — and anything office-server did after")
    expect(said).toContain('Waiting for a fleet admin to confirm')
    expect(out).toMatch(/Renewing the site's credential at HQ \.+ renewed/)
    expect(said).toContain('Restored. office-server now runs on new-server, and is named new-server, in place of the machine it ran on; HQ refuses that machine if it comes back.')
  })

  it('changes nothing when the person says no', async () => {
    answers = ['1', t.key, 'n']
    expect(await cli('restore', '--from', LOCATION, ADDRESS, CODE)).toBe(1)
    expect(out.trim().endsWith('Not restored. Nothing changed.')).toBe(true)
    expect(readPin(t.fresh.ctx.state)).toBeNull()
  })

  it("says what is needed for a site's backup given without a code", async () => {
    answers = ['1']
    expect(await cli('restore', '--from', LOCATION)).toBe(1)
    expect(asked).toEqual(['Which night? [1] '])
    expect(flat(out)).toContain('This is a backup of the site office-server. It comes back as the same site once a fleet admin lets this machine take its place: in the Fleet Console, Restore from a backup… on office-server gives a code. Then run: agenthix restore --from /mnt/nas/agenthix <hq address> <code>')
  })

  it('refuses an address or a code that is not one', () => {
    expect(parseCommand(['restore', '--from', LOCATION, ADDRESS])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['restore', '--from', LOCATION, ADDRESS, 'nope'])).toMatchObject({ kind: 'usage', message: expect.stringContaining('is not a code') })
    expect(parseCommand(['restore', '--from', LOCATION, ADDRESS, CODE])).toEqual({ kind: 'restore', from: LOCATION, address: ADDRESS, code: CODE })
  })
})
