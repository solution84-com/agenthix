import crypto from 'node:crypto'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fingerprintOf, verifyHostJoinBinding } from '@agenthix/core/host-crypto'
import { readPin, writePin } from '../../link/pin'
import type { Progress } from '../../sockets/lineServer'
import { readSiteCredential } from '../../install/siteCompose'
import { parseKeyWords } from '../keys'
import { readManifest } from '../parts'
import { holderFrom, openBackup } from '../seal'
import { ADDRESS, CODE, LOCATION, lostSite, until, type LostSite } from './lostSite'

let t: LostSite
let old: LostSite['old']
let fresh: LostSite['fresh']
let key: string
let backupCredential: string

beforeEach(async () => {
  t = await lostSite()
  ;({ old, fresh, key, backupCredential } = t)
})
afterEach(() => t.cleanup())

const askOn: LostSite['askOn'] = (...args) => t.askOn(...args)
const askForRestore = () => t.askForRestore()

async function chosen(): Promise<string> {
  const listed = await askOn(fresh, { op: 'restore.list', from: LOCATION })
  return listed.result.backups[0].name
}

/** The machine admin's side: check with the code, then connect; gives the connect's answer, still waiting. */
async function startOnMachine(progress: Progress[] = [], closed?: AbortSignal) {
  const name = await chosen()
  const checked = await askOn(fresh, { op: 'restore.check', from: LOCATION, name, key, address: ADDRESS, code: CODE })
  expect(checked).toMatchObject({ ok: true, result: { siteName: 'office-server', holds: ['site'] } })
  const connecting = askOn(fresh, { op: 'console.connect', address: ADDRESS, code: CODE }, p => progress.push(p), closed)
  await until(() => readPin(fresh.ctx.state) !== null)
  return { connecting }
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

describe("a site's backup carries its authority (adr-0119) @SC-834", () => {
  it("holds the credential the site proves itself to HQ with, sealed with the rest", async () => {
    const [file] = fs.readdirSync(fresh.backups.onMachine(LOCATION))
    const path = `${fresh.backups.onMachine(LOCATION)}/${file}`
    expect(backupCredential).toMatch(/^[0-9a-f]{64}$/)
    expect(fs.readFileSync(path).includes(Buffer.from(backupCredential))).toBe(false)
    const { records } = await openBackup(fs.createReadStream(path) as AsyncIterable<Buffer>, holderFrom(parseKeyWords(key)!))
    expect((await readManifest(records)).siteCredential).toBe(backupCredential)
    await records.return(undefined)
  })
})

describe('restoring a lost site onto a new machine @SC-834', () => {
  it('joins saying which backup it restores, renews the credential at HQ, and only then starts the site', async () => {
    const progress: Progress[] = []
    const { connecting } = await startOnMachine(progress)
    const [join] = t.joins
    const claim = { siteName: 'office-server', takenAt: '2026-10-14T02:00:00.000Z' }
    expect(join.restores).toEqual(claim)
    expect(await verifyHostJoinBinding(CODE, await fingerprintOf(join.identity), join.binding, { restores: claim })).toBe(true)
    expect(fresh.up.size).toBe(0)

    const asked = await askForRestore()
    expect(asked).toMatchObject({ ok: true, result: { executionSiteId: 'es-1', siteName: 'new-server', backup: { takenAt: claim.takenAt, holds: ['site'] } } })
    const answer = await connecting
    // Named after the machine it runs on now: the lost machine's name goes with it.
    expect(answer).toMatchObject({ ok: true, result: { restored: { siteName: 'new-server', formerName: 'office-server', executionSiteId: 'es-1' } } })
    expect(fresh.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'new-server' })

    const renewed = readSiteCredential(fresh.ctx.state)!
    expect(renewed).not.toBe(backupCredential)
    expect(t.hqCalls).toEqual([
      { bearer: backupCredential, machine: 'hmc_h-new_0123456789abcdef', body: { check: true } },
      { bearer: backupCredential, machine: 'hmc_h-new_0123456789abcdef', body: { credentialHash: sha256(renewed) } },
    ])
    const compose = fs.readFileSync(fresh.ctx.state.path('site', 'compose.json'), 'utf8')
    expect(compose).toContain(renewed)
    expect(compose).not.toContain(backupCredential)
    expect(fresh.up.has('agenthix-site')).toBe(true)
    expect(fresh.backups.databases.get('agenthix_site')?.toString()).toBe('the site rows')
    expect(JSON.parse(fs.readFileSync(fresh.ctx.state.path('site', 'data', 'restored.json'), 'utf8'))).toEqual({ night: (asked as { result: { backup: { night: string } } }).result.backup.night, takenAt: claim.takenAt })
    expect(progress.map(p => (p.event === 'step' ? p.step : null)).filter(Boolean)).toEqual([
      'Reaching HQ at https://hq.acme.example', 'Checking the key', 'Asking HQ whether office-server can come back here', 'Checking the images are signed', "Starting the site's database",
      "Restoring the site's database", "Restoring the site's workspaces", "Renewing the site's credential at HQ", 'Starting the site new-server',
    ])
  })

  it('writes nothing when HQ says the site is connected from its machine', async () => {
    t.hqAnswers.push(() => ({ status: 409, body: { error: 'Refused: office is connected to HQ right now, from office-server.' } }))
    const { connecting } = await startOnMachine()
    const asked = await askForRestore()
    expect(asked).toMatchObject({ ok: false, refusal: { message: 'Not restored: Refused: office is connected to HQ right now, from office-server. Nothing was changed.' } })
    expect(await connecting).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('connected to HQ right now') } })
    expect(fs.existsSync(fresh.ctx.state.path('site'))).toBe(false)
    expect(t.hqCalls).toHaveLength(1)
  })

  it('takes away what it wrote when HQ refuses the renewal itself', async () => {
    t.hqAnswers.push(() => ({ status: 200, body: { executionSiteId: 'es-1', siteName: 'office' } }), () => ({ status: 409, body: { error: 'Refused: office connected from office-server a moment ago.' } }))
    const { connecting } = await startOnMachine()
    expect(await askForRestore()).toMatchObject({ ok: false, refusal: { message: 'Not restored: Refused: office connected from office-server a moment ago. Nothing is left on new-server.' } })
    await connecting
    expect(fs.existsSync(fresh.ctx.state.path('site'))).toBe(false)
    expect(fresh.up.size).toBe(0)
  })

  it('keeps the site, its data and its renewed credential when it does not start after HQ renewed it', async () => {
    const composeUp = fresh.ctx.docker.composeUp.bind(fresh.ctx.docker)
    fresh.ctx.docker.composeUp = async (project, file) => {
      if (project.endsWith('-site')) throw new Error('the disk is full.')
      return composeUp(project, file)
    }
    const { connecting } = await startOnMachine()
    const asked = await askForRestore()
    expect(asked).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('HQ renewed its credential, but it did not start: the disk is full.') } })
    expect(asked).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('agenthix site resume') } })
    expect(asked).not.toMatchObject({ refusal: { message: expect.stringContaining('Nothing is left') } })
    await connecting
    const renewed = readSiteCredential(fresh.ctx.state)!
    expect(renewed).not.toBe(backupCredential)
    expect(t.hqCalls.at(-1)?.body).toEqual({ credentialHash: sha256(renewed) })
    expect(fresh.ctx.state.readJson('site', 'settings.json')).toMatchObject({ name: 'new-server' })
    expect(fresh.backups.databases.get('agenthix_site')?.toString()).toBe('the site rows')

    fresh.ctx.docker.composeUp = composeUp
    expect(await askOn(fresh, { op: 'resume', target: 'site' })).toMatchObject({ ok: true })
    expect(fresh.up.has('agenthix-site')).toBe(true)
  })

  it('asks again with the new credential when HQ took the renewal but its answer was lost', async () => {
    t.hqAnswers.push(
      () => ({ status: 200, body: { executionSiteId: 'es-1', siteName: 'office' } }),
      () => 'no answer',
      () => ({ status: 401, body: { error: 'unauthorized' } }),
      call => ({ status: 200, body: { executionSiteId: 'es-1', siteName: call.bearer === backupCredential ? 'wrong' : 'office' } }),
    )
    const { connecting } = await startOnMachine()
    expect(await askForRestore()).toMatchObject({ ok: true })
    await connecting
    expect(t.hqCalls.map(c => c.bearer)).toEqual([backupCredential, backupCredential, backupCredential, readSiteCredential(fresh.ctx.state)])
  })

  it('lets the restore go when the machine admin stops before the Fleet Console asks', async () => {
    const stop = new AbortController()
    const { connecting } = await startOnMachine([], stop.signal)
    stop.abort()
    expect(await connecting).toMatchObject({ ok: false, refusal: { message: 'Stopped before the restore began. Nothing was restored.' } })
    expect(await askForRestore()).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
    expect(t.hqCalls).toEqual([])
  })

  it('restores nothing on the Fleet Console’s word alone: a restore must wait on the machine', async () => {
    writePin(fresh.ctx.state, { ...readPin(old.ctx.state)!, hostId: 'h-new' })
    expect(await askForRestore()).toMatchObject({ ok: false, refusal: { code: 'not_found', message: expect.stringContaining('No restore waits on new-server.') } })
  })

  it("refuses a site's backup without a code, and a code on a machine that already answers a Fleet Console", async () => {
    const name = await chosen()
    expect(await askOn(fresh, { op: 'restore.run', from: LOCATION, name, key })).toMatchObject({
      ok: false, refusal: { message: expect.stringContaining('It comes back as the same site only with a code from Restore from a backup…') },
    })
    writePin(fresh.ctx.state, { ...readPin(old.ctx.state)!, hostId: 'h-new' })
    expect(await askOn(fresh, { op: 'restore.check', from: LOCATION, name, key, address: ADDRESS, code: CODE })).toMatchObject({
      ok: false, refusal: { message: expect.stringContaining('new-server is already managed by a Fleet Console') },
    })
  })
})
