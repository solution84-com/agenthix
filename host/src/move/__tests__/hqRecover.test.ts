/**
 * `agenthix hq move recover`: a move of hq that ended on neither machine. The old machine committed, but its commit
 * never reached the new one, which gave hq back by its deadline; the old machine never starts hq by itself once it
 * committed. Its machine admin starts it again from what it kept — only with a confirmation that the new machine is
 * not running hq, only once the new machine's deadline has passed, and never once the move completed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPin } from '../../link/pin'
import { readStore } from '../../scheduled/store'
import { parseCommand } from '../../cli/commands'
import { runCommand, type Io, type Send } from '../../cli/run'
import { ownerHandler } from '../../owner/dispatch'
import { readSend, writeSend } from '../record'
import { HQ, CONSOLE, hqMachines, NEW, OLD, SITE, type HqTwo } from './hqMachines'

let two: HqTwo
beforeEach(async () => {
  two = await hqMachines()
  await two.arm()
  await two.sendNow()
  await two.run()
  // The commit never reached the new machine: it gave HQ back, and HQ runs on neither.
  for (const p of [HQ, SITE, CONSOLE]) two.fresh.up.delete(p)
})
afterEach(() => two.cleanup())

const ask = (request: Record<string, unknown>) => ownerHandler(two.old.ctx)(request, () => {})
const pastDeadline = () => two.old.ctx.sleep(readSend(two.old.ctx.state)!.deadline! - two.old.ctx.now().getTime() + 1)
const moveEntry = () => readStore(two.old.ctx.state).entries.find(e => e.change.kind === 'move')
const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('agenthix hq move recover @SC-859', () => {
  it('is refused without the confirmation that the new machine is not running HQ, and starts nothing', async () => {
    await pastDeadline()
    expect(await ask({ op: 'hq.moveRecover' })).toMatchObject({
      ok: false, refusal: { code: 'conflict', message: expect.stringContaining('make sure HQ is not running on new-server') },
    })
    expect(await ask({ op: 'hq.moveRecover', confirmed: 'yes' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(two.old.up.has(HQ)).toBe(false)
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
  })

  it('is refused while the new machine may still be taking HQ over', async () => {
    // The new machine's deadline is still ahead, by this machine's clock.
    writeSend(two.old.ctx.state, { ...readSend(two.old.ctx.state)!, deadline: two.old.ctx.now().getTime() + 60_000 })
    expect(await ask({ op: 'hq.moveRecover', confirmed: true })).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringMatching(/^Not yet: new-server may still be taking HQ over/) } })
    expect(two.old.up.has(HQ)).toBe(false)
  })

  it('is refused while the move still runs: it puts HQ back by itself if it fails', async () => {
    await pastDeadline()
    writeSend(two.old.ctx.state, { ...readSend(two.old.ctx.state)!, phase: 'released' })
    expect(await ask({ op: 'hq.moveRecover', confirmed: true })).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('HQ is moving to new-server now') } })
    expect(two.old.up.has(HQ)).toBe(false)
  })

  it('is refused while this machine reaches HQ at its new address: HQ runs there', async () => {
    await pastDeadline()
    two.old.ctx.link = { start: () => {}, stop: () => {}, connected: () => true, sendEnvelope: () => {} }
    expect(await ask({ op: 'hq.moveRecover', confirmed: true })).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining(`connected to HQ at ${NEW}`) } })
    expect(two.old.up.has(HQ)).toBe(false)
  })

  it('is refused once the move completed and the copy here was removed', async () => {
    expect(await two.as(two.old, { op: 'remove', target: 'hq' })).toMatchObject({ ok: true })
    await pastDeadline()
    expect(await ask({ op: 'hq.moveRecover', confirmed: true })).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('took over on new-server') } })
    expect(two.old.up.size).toBe(0)
  })

  it('starts HQ, its site and the Fleet Console here again from what was kept, writable, and records it', async () => {
    await pastDeadline()
    const r = await ask({ op: 'hq.moveRecover', confirmed: true })
    expect(r).toMatchObject({ ok: true, result: { state: 'started', machine: 'hq-box', peerName: 'new-server', address: OLD } })
    for (const p of [HQ, SITE, CONSOLE]) expect(two.old.up.has(p), p).toBe(true)
    expect(readPin(two.old.ctx.state)).toMatchObject({ hqAddress: 'http://127.0.0.1:4100', local: true })
    expect(readSend(two.old.ctx.state)).toMatchObject({ phase: 'rolledBack', recoveredAt: expect.any(String), reason: expect.stringContaining('neither machine') })
    // Those that followed HQ's new address are told it stays here, and the Fleet Console hears the move did not complete.
    expect(two.said.old.filter(c => c[0] === 'address-move').at(-1)).toEqual(['address-move', OLD])
    expect(two.told.old.flatMap(m => (m.kind === 'move' ? [m.report.state] : [])).at(-1)).toBe('rolledBack')
    expect(moveEntry()).toMatchObject({ change: { state: 'rolledBack' }, notice: { update: 'failed', reason: expect.stringContaining('neither machine') } })

    // The Fleet Console's late word to remove the copy here is refused, and it is not started twice.
    expect(await two.as(two.old, { op: 'remove', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(await ask({ op: 'hq.moveRecover', confirmed: true })).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('runs here already') } })
  })

  it('asks first on the command line, saying plainly that the new machine must not be running HQ', async () => {
    await pastDeadline()
    let out = ''
    let err = ''
    const answers: (string | null)[] = ['n']
    const io: Io = { out: t => { out += `${t}\n` }, write: t => { out += t }, err: t => { err += `${t}\n` }, ask: async () => (answers.length ? answers.shift()! : null) }
    const send: Send = (request, onProgress) => ownerHandler(two.old.ctx)(request, onProgress) as Promise<Record<string, unknown>>
    const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => two.old.ctx.now())

    expect(parseCommand(['hq', 'move', 'recover'])).toEqual({ kind: 'moveRecover', yes: false })
    expect(parseCommand(['hq', 'move', 'recover', '--yes'])).toEqual({ kind: 'moveRecover', yes: true })
    expect(parseCommand(['hq', 'move'])).toMatchObject({ kind: 'usage' })

    expect(await cli('hq', 'move', 'recover')).toBe(1)
    expect(flat(out)).toContain('make sure HQ is not running on new-server')
    expect(two.old.up.has(HQ)).toBe(false)

    out = ''
    expect(await cli('hq', 'move', 'recover', '--yes')).toBe(0)
    expect(err).toBe('')
    expect(flat(out)).toContain(`HQ runs on hq-box again, at ${OLD}`)
    expect(two.old.up.has(HQ)).toBe(true)
  })

  it('says there is nothing to recover on a machine HQ never moved from', async () => {
    expect(await ownerHandler(two.fresh.ctx)({ op: 'hq.moveRecover', confirmed: true }, () => {})).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
  })
})
