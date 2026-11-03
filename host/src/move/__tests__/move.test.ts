import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fromBase64url, generateHostKeys, signTransferChunk } from '@agenthix/core/host-crypto'
import { readSiteCredential } from '../../install/siteCompose'
import { noticesForSite } from '../../scheduled/notices'
import { readStore } from '../../scheduled/store'
import { readReceive, readSend, writeReceive } from '../record'
import { settleAfterRestart } from '../receive'
import { moveCodeAnswered } from '../code'
import { parseCommand } from '../../cli/commands'
import { runCommand, type Send } from '../../cli/run'
import { ownerHandler } from '../../owner/dispatch'
import { restoreOnNewMachine } from '../../backups/restore'
import { deliver } from '../wire'
import { siteAnswersHq, twoMachines, until, type Two } from './twoMachines'
import { gate, hold, openAt } from '../../backups/__tests__/held'

let two: Two
beforeEach(async () => {
  two = await twoMachines()
})
afterEach(() => two.cleanup())

const SITE = 'agenthix-site'
const moveEntry = () => readStore(two.old.ctx.state).entries.find(e => e.change.kind === 'move')
const reports = (from: 'old' | 'new') => two.told[from].flatMap(m => (m.kind === 'move' ? [m.report.state] : []))

describe('a site moves to a new machine @SC-858', () => {
  it("arrives with its credential, its database and its workspaces, named after its new machine, and hq reads none of it", async () => {
    siteAnswersHq(two.fresh, true)
    const seen: string[] = []
    two.hq.act = (_from, _type, payload) => {
      seen.push(JSON.stringify(payload))
      return payload
    }
    // The Fleet Console asks no name when it adds a site: the host service names it after its machine.
    expect(two.old.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'office-server' })
    expect(await two.arm()).toMatchObject({ ok: true, result: { transferId: 'transfer-0001' } })
    expect(await two.sendNow()).toMatchObject({ ok: true, result: { transferId: 'transfer-0001' } })
    await two.run()

    expect(moveEntry()?.change.state).toBe('done')
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'committed')
    expect(two.fresh.up.has(SITE)).toBe(true)
    expect(two.old.up.has(SITE)).toBe(false)
    const credential = readSiteCredential(two.old.ctx.state)!
    expect(readSiteCredential(two.fresh.ctx.state)).toBe(credential)
    // One machine, one site, named after the machine: the site takes the new machine's name.
    expect(two.fresh.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'new-server', hqUrl: 'https://hq.acme.example' })
    expect(two.fresh.backups.databases.get('agenthix_site')?.toString()).toBe('the site rows')
    expect(two.fresh.backups.folders.get('path:/home/sam/.agenthix/site/data')?.toString()).toBe('the workspaces')

    // hq passed every frame, and none carried the credential, the rows, the workspaces or the site's master key.
    const wire = seen.join('\n')
    const masterKey = (two.old.ctx.state.readJson('secrets.json') as { siteMasterKey: string }).siteMasterKey
    for (const secret of [credential, 'the site rows', 'the workspaces', masterKey]) expect(wire.includes(secret)).toBe(false)
    expect(seen.length).toBeGreaterThan(3)

    // The new machine's site tells hq the move completed, so hq resumes the paused runs.
    expect(noticesForSite(two.fresh.ctx)).toContainEqual(expect.objectContaining({ update: 'completed', change: expect.objectContaining({ kind: 'move', siteName: 'office-server' }) }))
    expect(reports('old')).toEqual(['started', 'transferring', 'committed'])
    expect(reports('new')).toEqual(['restoring', 'tookOver'])
  })

  it('removes the copy on the old machine only once the site answers from the new one', async () => {
    // Before any move, the copy here is the site itself.
    expect(await two.as(two.old, { op: 'remove', target: 'site' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    siteAnswersHq(two.fresh, false)
    // The new machine asks its site in real time here, so the test can let it answer partway.
    two.fresh.ctx.sleep = () => new Promise(resolve => setTimeout(resolve, 10))
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'starting')
    // Released, not yet answering: the old machine still holds everything, and refuses to remove it.
    expect(fs.existsSync(two.old.ctx.state.path('site', 'settings.json'))).toBe(true)
    expect(readSiteCredential(two.old.ctx.state)).not.toBeNull()
    expect(await two.as(two.old, { op: 'remove', target: 'site' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    siteAnswersHq(two.fresh, true)
    await moving
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    expect(fs.existsSync(two.old.ctx.state.path('site', 'settings.json'))).toBe(true)

    expect(await two.as(two.old, { op: 'remove', target: 'site' })).toMatchObject({ ok: true, result: { state: 'removed' } })
    expect(fs.existsSync(two.old.ctx.state.path('site'))).toBe(false)
    expect(readSend(two.old.ctx.state)?.phase).toBe('removed')
    expect(reports('old')).toContain('removed')
  })

  it('waits for a backup that holds the old machine, such as the nightly one, rather than failing', async () => {
    siteAnswersHq(two.fresh, true)
    const backup = gate()
    const held = hold('backup', backup)
    // The two machines' clocks keep together while the old one waits, as real clocks do.
    const oldSleep = two.old.ctx.sleep
    two.old.ctx.sleep = async ms => { await two.fresh.ctx.sleep(ms); await oldSleep(ms) }
    openAt(two.old.ctx, new Date(two.old.ctx.now().getTime() + 10 * 60_000), backup, held)
    await two.arm()
    await two.sendNow()
    await two.run()
    await held
    expect(moveEntry()?.change.state).toBe('done')
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
  })
})

describe('the new machine, while it waits @SC-858', () => {
  it('starts no site of its own, and refuses one', async () => {
    await two.arm()
    expect(await two.as(two.fresh, { op: 'install', target: 'site', version: '0.2.0' })).toMatchObject({
      ok: false, refusal: { code: 'conflict', message: expect.stringContaining('waiting to receive the site office') },
    })
    expect(two.fresh.up.size).toBe(0)
    expect(two.fresh.ctx.state.readJson('site', 'settings.json')).toBeNull()
    expect(two.fresh.calls.some(c => c[0] === 'compose')).toBe(false)
  })

  it("refuses its machine admin's install and restore until the move ends", async () => {
    await two.arm()
    const ask = (data: unknown) => ownerHandler(two.fresh.ctx)(data, () => {}) as Promise<Record<string, unknown>>
    const words = 'new-server is waiting to receive the site office-server from office-server'
    const refused = { ok: false, refusal: { code: 'conflict', message: expect.stringContaining(words) } }
    expect(await ask({ op: 'install', target: 'hq', version: two.fresh.ctx.machine.hostServiceVersion, address: 'https://hq.acme.example' })).toMatchObject(refused)
    fs.mkdirSync(two.fresh.backups.onMachine('/mnt/nas/agenthix'), { recursive: true })
    expect(await ask({ op: 'restore.list', from: '/mnt/nas/agenthix' })).toMatchObject(refused)
    await expect(restoreOnNewMachine(two.fresh.ctx, { kind: 'machine', name: 'any.sealed' }, '', () => {})).rejects.toThrow(words)
    expect(two.fresh.calls.some(c => c[0] === 'compose')).toBe(false)
  })

  it('leaves a site installed since it was armed as it is when the move then arrives', async () => {
    siteAnswersHq(two.fresh, true)
    await two.arm()
    const armed = readReceive(two.fresh.ctx.state)!
    // Installed meanwhile, as a host service before this check let a machine admin do.
    fs.rmSync(two.fresh.ctx.state.path('move', 'receive.json'))
    expect(await two.as(two.fresh, { op: 'install', target: 'site', version: '0.2.0' })).toMatchObject({ ok: true })
    writeReceive(two.fresh.ctx.state, armed)
    two.fresh.backups.databases.set('agenthix_site', Buffer.from('its own rows'))
    await two.sendNow()
    await two.run()
    expect(moveEntry()?.change.state).toBe('rolledBack')
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('failed')
    expect(two.old.up.has(SITE)).toBe(true)
    expect(two.fresh.up.has(SITE)).toBe(true)
    expect(two.fresh.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'new-server' })
    expect(two.fresh.backups.databases.get('agenthix_site')?.toString()).toBe('its own rows')
    expect(two.fresh.calls.some(c => c.includes('down'))).toBe(false)
  })

  it('is never a machine that already carries a site', async () => {
    const toOld = { ...(await two.moveRequest('send')), role: 'receive', siteName: 'office' }
    expect(await two.as(two.old, toOld)).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining('already carries the site office') } })
  })
})

describe('what hq carries, it cannot alter @SC-858', () => {
  it('a chunk changed on the way fails the restore, keeps nothing on the new machine, and the site carries on where it was', async () => {
    siteAnswersHq(two.fresh, true)
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
    expect(moveEntry()?.notice?.reason).toMatch(/was not as the old machine sent it/)
    expect(two.old.up.has(SITE)).toBe(true)
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('failed')
    expect(two.fresh.up.has(SITE)).toBe(false)
    expect(two.fresh.ctx.state.readJson('site', 'settings.json')).toBeNull()
    expect(fs.existsSync(two.fresh.ctx.state.path('move', 'incoming.part'))).toBe(false)
  })

  it("a backup of hq's own, sealed to the new machine's public key, is refused as not the old machine's", async () => {
    const stranger = await generateHostKeys('host')
    let forged = false
    two.hq.act = (from, type, payload) => {
      if (from !== 'old' || type !== 'transfer.chunk') return payload
      if (forged) return null
      forged = true
      void signTransferChunk(stranger, { transferId: 'transfer-0001', from: two.oldFp, to: two.newFp, seq: 0, last: true }, Buffer.from('SEALBK01 of hq'))
        .then(chunk => deliver(two.fresh.ctx, 'transfer.chunk', chunk as never))
      return null
    }
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'failed')
    expect(readReceive(two.fresh.ctx.state)?.reason).toMatch(/was not as the old machine sent it/)
    expect(two.fresh.up.size).toBe(0)
    await moving
    expect(two.old.up.has(SITE)).toBe(true)
    expect(moveEntry()?.change.state).toBe('rolledBack')
  })
})

describe('when the new machine does not take over @SC-858', () => {
  it('brings the site back on the old machine, which still holds everything, and says the move did not complete', async () => {
    siteAnswersHq(two.fresh, false)
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(moveEntry()?.change.state).toBe('rolledBack')
    expect(moveEntry()?.notice).toMatchObject({ update: 'failed', reason: expect.stringMatching(/did not complete.*did not answer HQ from new-server in time/) })
    expect(two.old.up.has(SITE)).toBe(true)
    expect(readSend(two.old.ctx.state)?.phase).toBe('rolledBack')
    expect(two.fresh.up.has(SITE)).toBe(false)
    expect(two.fresh.ctx.state.readJson('site', 'settings.json')).toBeNull()
    expect(reports('old')).toContain('rolledBack')
    expect(reports('new')).toContain('failed')
  })

  it('never runs the site on both: when the new machine falls silent after the release, the old one waits out its deadline', async () => {
    siteAnswersHq(two.fresh, true)
    let bothRan = false
    const watch = setInterval(() => { if (two.old.up.has(SITE) && two.fresh.up.has(SITE)) bothRan = true }, 1)
    // hq passes nothing more from the new machine once it has the site's credential.
    two.hq.act = (from, _type, payload) => (from === 'new' && readReceive(two.fresh.ctx.state)?.phase !== 'receiving' && readReceive(two.fresh.ctx.state)?.phase !== 'restored' ? null : payload)
    await two.arm()
    await two.sendNow()
    const moving = two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'tookOver')
    expect(two.old.up.has(SITE)).toBe(false)
    // The new machine hears no commit by its deadline: it stops the site and clears it.
    await two.fresh.ctx.sleep(2_000)
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'failed')
    expect(two.fresh.up.has(SITE)).toBe(false)
    // The old machine, told nothing, waits until its own, later deadline before it starts the site again.
    await two.old.ctx.sleep(2_000)
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(two.old.up.has(SITE)).toBe(false)
    await two.old.ctx.sleep(120_000)
    await moving
    clearInterval(watch)
    expect(two.old.up.has(SITE)).toBe(true)
    expect(bothRan).toBe(false)
    expect(moveEntry()?.change.state).toBe('rolledBack')
  }, 15_000)
})

describe('agenthix site schedule move --at <time> @SC-858', () => {
  it("prints the Fleet Console's code, which reached the machine sealed, and the line for the new machine", async () => {
    let out = ''
    let err = ''
    const io = { out: (t: string) => { out += `${t}\n` }, write: (t: string) => { out += t }, err: (t: string) => { err += `${t}\n` }, ask: async () => null }
    const send: Send = (request, onProgress) => ownerHandler(two.old.ctx)(request, onProgress) as Promise<Record<string, unknown>>
    const running = runCommand(parseCommand(['site', 'schedule', 'move', '--at', 'tomorrow 02:00']), send, io, '0.2.0', () => two.old.ctx.now())
    await until(() => two.told.old.some(m => m.kind === 'moveCodeAsk'))
    const ask = two.told.old.find(m => m.kind === 'moveCodeAsk') as { askId: string; at: string }
    expect(Date.parse(ask.at)).toBeGreaterThan(two.old.ctx.now().getTime())
    moveCodeAnswered({ kind: 'moveCode', replyTo: ask.askId, code: 'K7QM-4XPD-93TB', expiresAt: '2026-10-14T10:00:00Z', problem: null })
    expect(await running).toBe(0)
    expect(err).toBe('')
    expect(out.replace(/\s+/g, ' ')).toContain('console connect https://hq.acme.example K7QM-4XPD-93TB')
  })
})

describe('a restart in the middle of a move @SC-858', () => {
  it('on the new machine, clears a site it was starting but was never told is its own', async () => {
    const req = await two.moveRequest('receive')
    if (req.role !== 'receive') throw new Error('not a receive')
    two.fresh.up.add(SITE)
    two.fresh.ctx.state.writeJson(['site', 'settings.json'], { name: 'office', version: '0.2.0', images: {}, hqUrl: 'https://hq.acme.example', installedAt: 'x' })
    two.fresh.ctx.state.writePrivate(['site', 'compose.json'], '{}')
    writeReceive(two.fresh.ctx.state, { ...req, peerName: 'office-server', phase: 'starting', armedAt: 'x', deadline: 1, reason: null })
    await settleAfterRestart(two.fresh.ctx)
    expect(two.fresh.up.has(SITE)).toBe(false)
    expect(readReceive(two.fresh.ctx.state)?.phase).toBe('failed')
  })
})
