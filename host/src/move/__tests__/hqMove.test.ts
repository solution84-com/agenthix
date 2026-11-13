import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fromBase64url } from '@agenthix/core/host-crypto'
import { readPin } from '../../link/pin'
import { readStore } from '../../scheduled/store'
import { BackupStore } from '../../backups/store'
import { readReceive, readSend, writeReceive, writeSend } from '../record'
import { settleAfterRestart } from '../receive'
import { moveCodeAnswered } from '../code'
import { parseCommand } from '../../cli/commands'
import { runCommand, type Send } from '../../cli/run'
import { ownerHandler } from '../../owner/dispatch'
import { install } from '../../install/install'
import { timePassesUntil, until } from './twoMachines'
import { HQ, hqMachines, CONSOLE, NEW, OLD, SITE, type HqTwo } from './hqMachines'

let two: HqTwo
let bothRan: boolean
let watch: ReturnType<typeof setInterval>
beforeEach(async () => {
  two = await hqMachines()
  bothRan = false
  watch = setInterval(() => { if (two.old.up.has(HQ) && two.fresh.up.has(HQ)) bothRan = true }, 1)
})
afterEach(async () => {
  clearInterval(watch)
  await two.cleanup()
})

const moveEntry = () => readStore(two.old.ctx.state).entries.find(e => e.change.kind === 'move')
const reports = (from: 'old' | 'new') => two.told[from].flatMap(m => (m.kind === 'move' ? [m.report.state] : []))
/** What hq was told on its control socket, beside the scheduled change's notices. */
const said = (side: 'old' | 'new') => two.said[side].filter(c => c[0] !== 'scheduled-change')
const secrets = (m: HqTwo['old']) => m.ctx.state.readJson('secrets.json') as Record<string, string> | null

describe('HQ moves to a new machine @SC-859', () => {
  it('runs there with its data, its site and the Fleet Console, at its new address, and never on both machines', async () => {
    const before = secrets(two.old)
    expect(await two.arm()).toMatchObject({ ok: true })
    expect(await two.sendNow()).toMatchObject({ ok: true, result: { transferId: 'transfer-hq-0001' } })
    await two.run()

    expect(moveEntry()?.change.state).toBe('done')
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'committed')
    expect(bothRan).toBe(false)
    for (const p of [HQ, SITE, CONSOLE]) expect(two.fresh.up.has(p), p).toBe(true)
    for (const p of [HQ, SITE, CONSOLE]) expect(two.old.up.has(p), p).toBe(false)
    expect(two.fresh.ctx.state.readJson('hq', 'settings.json')).toMatchObject({ address: NEW, bind: '0.0.0.0' })
    expect(two.fresh.ctx.state.readJson('installation.json')).toMatchObject({ ports: { hq: 4100, console: 7801 } })
    expect(secrets(two.fresh)).toEqual(before)
    expect(two.fresh.backups.databases.get('agenthix_hq')?.toString()).toBe('the hq rows')
    expect(two.fresh.backups.databases.get('agenthix_site')?.toString()).toBe('the site rows')
    expect(two.fresh.backups.folders.get('volume:agenthix-hq-storage')?.toString()).toBe('the uploaded files')
    expect(two.fresh.backups.folders.get('path:/home/sam/.agenthix/site/data')?.toString()).toBe('the workspaces')
    expect(two.fresh.backups.folders.get('volume:agenthix-console-state')?.toString()).toBe('the fleet console keys')

    // The new machine reaches hq on itself; the old one, at hq's new address.
    expect(readPin(two.fresh.ctx.state)).toMatchObject({ hqAddress: 'http://127.0.0.1:4100', local: true })
    expect(readPin(two.old.ctx.state)).toMatchObject({ hqAddress: NEW, local: false })
    // Old hq: told everyone the new address, then went read-only before the backup; the new one is read-only only
    // until the old machine commits, and hears the change completed so it resumes the paused runs.
    // Said again while the move runs, in case hq starts anew (hqReadOnly.test.ts): the same word each time.
    expect(said('old').filter((c, i, all) => i === 0 || c.join(' ') !== all[i - 1].join(' '))).toEqual([['address-move', NEW], ['read-only', 'on', 'new-server']])
    const fresh = said('new').map(c => c[0])
    expect(fresh.indexOf('read-only')).toBeLessThan(fresh.indexOf('transfer-open'))
    expect(two.said.new).toContainEqual(['transfer-open', 'transfer-hq-0001', expect.any(String), expect.any(String)])
    expect(two.said.new).toContainEqual(['read-only', 'off'])
    expect(two.said.new.some(c => c[0] === 'scheduled-change' && c[1].includes('"completed"'))).toBe(true)
    expect(reports('old')).toEqual(['started', 'transferring', 'committed'])
    expect(reports('new')).toEqual(expect.arrayContaining(['restoring', 'tookOver']))
  })

  it('publishes the Fleet Console on the new machine on the port the request chose @SC-1243', async () => {
    expect(await two.as(two.fresh, { ...(await two.moveRequest('receive')), consolePort: 7600 })).toMatchObject({ ok: true })
    await two.sendNow()
    await two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'committed')
    expect(two.fresh.ctx.state.readJson('installation.json')).toMatchObject({ ports: { hq: 4100, console: 7600 } })
  })

  it('refuses ports it could not publish before anything arrives @SC-1244', async () => {
    const receive = await two.moveRequest('receive')
    for (const ports of [{ consolePort: 80 }, { hqPort: 7600, consolePort: 7600 }]) {
      expect(await two.as(two.fresh, { ...receive, ...ports }), JSON.stringify(ports)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    }
    expect(readReceive(two.fresh.ctx.state)).toBeNull()
  })

  it('removes nothing on the old machine before HQ answers from the new one', async () => {
    expect(await two.as(two.old, { op: 'remove', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    two.fresh.hq.status = null
    two.fresh.ctx.sleep = () => new Promise(resolve => setTimeout(resolve, 5))
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'starting' && two.fresh.up.has(HQ))
    expect(await two.as(two.old, { op: 'remove', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(two.old.ctx.state.readJson('hq', 'settings.json')).not.toBeNull()
    expect(secrets(two.old)).not.toBeNull()
    two.fresh.hq.status = { ok: true, text: 'HQ', data: { users: 1, hqSite: { state: 'connected' }, address: NEW, version: '0.2.0', commit: 'c' } }
    await moving
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    expect(two.old.ctx.state.readJson('hq', 'settings.json')).not.toBeNull()

    expect(await two.as(two.old, { op: 'remove', target: 'hq' })).toMatchObject({ ok: true, result: { state: 'removed' } })
    for (const part of ['hq', 'site', 'console', 'secrets.json']) expect(fs.existsSync(two.old.ctx.state.path(part)), part).toBe(false)
    // Its backups stay, sealed to the old machine.
    expect((await new BackupStore(two.old.ctx.state).list()).length).toBeGreaterThan(0)
    expect(readSend(two.old.ctx.state)?.phase).toBe('removed')
    expect(reports('old')).toContain('removed')
  })
})

describe('when the new machine does not take over @SC-859', () => {
  it('brings HQ back on the old machine, writable, with its site and the Fleet Console, and leaves the new one as it was', async () => {
    two.fresh.hq.status = null
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'failed')
    // Its word that it gave HQ back crosses no hq: the old machine starts HQ again only once its own deadline passed.
    expect(two.old.up.has(HQ)).toBe(false)
    await timePassesUntil(two.old, moving)
    expect(moveEntry()?.change.state).toBe('rolledBack')
    expect(moveEntry()?.notice).toMatchObject({ update: 'failed', reason: expect.stringMatching(/did not complete/) })
    expect(bothRan).toBe(false)
    for (const p of [HQ, SITE, CONSOLE]) expect(two.old.up.has(p), p).toBe(true)
    expect(two.fresh.up.size).toBe(0)
    expect(readPin(two.old.ctx.state)).toMatchObject({ hqAddress: 'http://127.0.0.1:4100', local: true })
    expect(readPin(two.fresh.ctx.state)).toMatchObject({ hqAddress: OLD, local: false })
    for (const part of ['hq', 'site', 'console', 'secrets.json']) expect(fs.existsSync(two.fresh.ctx.state.path(part)), part).toBe(false)
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('failed')
    // Those told the new address are told HQ stays.
    expect(said('old').at(-1)).toEqual(['address-move', OLD])
    expect(reports('old')).toContain('rolledBack')
  }, 15_000)

  it('leaves an HQ installed on the new machine since it was armed as it is when the move then arrives', async () => {
    await two.arm()
    const armed = readReceive(two.fresh.ctx.state)!
    // Installed meanwhile, as a host service before this check let a machine admin do.
    fs.rmSync(two.fresh.ctx.state.path('move', 'receive.json'))
    await install(two.fresh.ctx, { address: 'https://own.example' }, () => {})
    writeReceive(two.fresh.ctx.state, armed)
    await two.sendNow()
    await two.run()
    expect(moveEntry()?.change.state).toBe('rolledBack')
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'failed')
    expect(two.old.up.has(HQ)).toBe(true)
    expect(two.fresh.up.has(HQ) && two.fresh.up.has(SITE)).toBe(true)
    expect(two.fresh.ctx.state.readJson('hq', 'settings.json')).toMatchObject({ address: 'https://own.example' })
    expect(two.fresh.calls.some(c => c[0] === 'compose' && c.includes('down'))).toBe(false)
  }, 15_000)

  it('is refused on the new machine, which keeps nothing, when a port HQ or the Fleet Console would publish is held there @SC-1244', async () => {
    two.fresh.heldPorts.add(7801)
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'failed')
    expect(JSON.stringify(readReceive(two.fresh.ctx.state))).toContain('Port 7801, for the Fleet Console, is held by a program on this machine, not by a container.')
    await timePassesUntil(two.old, moving)
    expect(bothRan).toBe(false)
    for (const p of [HQ, SITE, CONSOLE]) expect(two.old.up.has(p), p).toBe(true)
    expect(two.fresh.up.size).toBe(0)
    for (const part of ['hq', 'site', 'console']) expect(fs.existsSync(two.fresh.ctx.state.path(part)), part).toBe(false)
  }, 15_000)

  it('ends the move before the release with HQ never stopped, only read-only for the while, when a chunk was altered', async () => {
    two.hq.act = (from, type, payload) => {
      if (from !== 'old' || type !== 'transfer.chunk' || payload.seq !== 0) return payload
      const bytes = Buffer.from(fromBase64url(payload.data as string)!)
      bytes[bytes.length - 1] ^= 1
      return { ...payload, data: bytes.toString('base64url') }
    }
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(moveEntry()?.change.state).toBe('rolledBack')
    expect(said('old')).toContainEqual(['read-only', 'off'])
    expect(two.old.calls.some(c => c[0] === 'compose' && c.includes(HQ) && c.includes('stop'))).toBe(false)
    expect(two.old.up.has(HQ)).toBe(true)
    expect(two.fresh.up.size).toBe(0)
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('failed')
  })
})

describe('agenthix hq schedule move --at <time> --address <address> @SC-859', () => {
  it("asks the Fleet Console, sealed, for the code that moves HQ, and prints the line for the new machine at HQ's address", async () => {
    let out = ''
    let err = ''
    const io = { out: (t: string) => { out += `${t}\n` }, write: (t: string) => { out += t }, err: (t: string) => { err += `${t}\n` }, ask: async () => null }
    const send: Send = (request, onProgress) => ownerHandler(two.old.ctx)(request, onProgress) as Promise<Record<string, unknown>>
    const running = runCommand(parseCommand(['hq', 'schedule', 'move', '--at', 'tomorrow 02:00', '--address', NEW]), send, io, '0.2.0', () => two.old.ctx.now())
    await until(() => two.told.old.some(m => m.kind === 'moveCodeAsk'))
    const ask = two.told.old.find(m => m.kind === 'moveCodeAsk') as { askId: string; target?: string; hqAddress?: string }
    expect(ask).toMatchObject({ target: 'hq', hqAddress: NEW })
    moveCodeAnswered({ kind: 'moveCode', replyTo: ask.askId, code: 'K7QM-4XPD-93TB', expiresAt: '2026-10-14T10:00:00Z', problem: null })
    expect(await running).toBe(0)
    expect(err).toBe('')
    expect(out.replace(/\s+/g, ' ')).toContain(`console connect ${OLD} K7QM-4XPD-93TB`)
    expect(out.replace(/\s+/g, ' ')).toContain(`it answers at ${NEW} once it runs on the new machine`)
  })

  it('refuses without a time, and on a machine that runs no HQ', async () => {
    expect(parseCommand(['hq', 'schedule', 'move', '--address', NEW])).toMatchObject({ kind: 'usage' })
    expect(await ownerHandler(two.fresh.ctx)({ op: 'hq.moveCode', at: '2026-10-15T02:00:00Z' }, () => {})).toMatchObject({ ok: false, refusal: { code: 'not_installed' } })
  })
})

describe('a restart in the middle of taking HQ in @SC-859', () => {
  it('on the new machine, clears HQ it was starting but was never told is its own, and dials where it did before', async () => {
    await two.arm()
    two.fresh.up.add(HQ)
    two.fresh.ctx.state.writeJson(['hq', 'settings.json'], { address: NEW, port: 4100 })
    two.fresh.ctx.state.writePrivate(['hq', 'compose.json'], '{}')
    writeReceive(two.fresh.ctx.state, { ...readReceive(two.fresh.ctx.state)!, phase: 'starting', deadline: 1, pinBefore: { hqAddress: OLD, local: false } })
    await settleAfterRestart(two.fresh.ctx)
    expect(two.fresh.up.has(HQ)).toBe(false)
    expect(two.fresh.ctx.state.readJson('hq', 'settings.json')).toBeNull()
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('failed')
    expect(readPin(two.fresh.ctx.state)).toMatchObject({ hqAddress: OLD, local: false })
  })
})

describe('HQ installed here after an earlier HQ moved away @SC-859', () => {
  const earlier = async (installedAt: string, phase: 'committed' | 'removed') => {
    const send = await two.moveRequest('send')
    writeSend(two.old.ctx.state, {
      transferId: 'transfer-earlier', peer: send.peer, peerIdentity: send.peerIdentity, phase, releasedAt: 1, deadline: 2, reason: null, target: 'hq', installedAt,
    })
  }
  const hqInstalledAt = () => (two.old.ctx.state.readJson('hq', 'settings.json') as { installedAt: string }).installedAt

  it('moves: the earlier move guards nothing of it', async () => {
    await earlier('2026-10-01T00:00:00.000Z', 'removed')
    await two.arm()
    expect(await two.sendNow()).toMatchObject({ ok: true })
  })

  it('is refused once this HQ itself has moved away', async () => {
    await earlier(hqInstalledAt(), 'committed')
    expect(await two.sendNow()).toMatchObject({ ok: false, refusal: { code: 'conflict', message: 'HQ has moved from hq-box already.' } })
  })
})
