import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EXPORT_CHUNK_BYTES, EXPORT_HELD_MS } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { machineHolder, parseKeyWords } from '../keys'
import { holderFrom, openBackup, WrongKey } from '../seal'
import { HELD_EXPORTS, sweepHeldExports } from '../exportDownload'

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, 'https://hq.acme.example', () => {})
  // Large enough to take more than one chunk once sealed.
  m.backups.databases.set('agenthix_hq', Buffer.alloc(EXPORT_CHUNK_BYTES + 4096, 3))
})
afterEach(() => m.cleanup())

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the owner socket answers JSON of any operation's shape
const ask = (data: unknown) => ownerHandler(m.ctx)(data, () => {}) as Promise<Record<string, any>>

/** An export as the Fleet Console asks for one: a backup taken, then exported. */
async function exportForConsole(): Promise<{ exportId: string; key: string; sizeBytes: number }> {
  const taken = await ask({ op: 'backup.take' })
  const r = await ask({ op: 'backup.export', backupId: taken.result.backup.id })
  expect(r.ok).toBe(true)
  return r.result
}

async function download(exportId: string): Promise<Buffer> {
  const parts: Buffer[] = []
  for (let offset = 0; ;) {
    const r = await ask({ op: 'backup.exportRead', exportId, offset })
    expect(r.ok).toBe(true)
    const chunk = Buffer.from(r.result.data, 'base64url')
    parts.push(chunk)
    offset += chunk.length
    if (r.result.last) break
  }
  return Buffer.concat(parts)
}

describe('an export made for the Fleet Console @SC-831', () => {
  it('is held in the state folder apart from the machine admin’s exports, at its true size', async () => {
    const made = await exportForConsole()
    const held = m.ctx.state.path(HELD_EXPORTS, made.exportId)
    expect(fs.existsSync(held)).toBe(true)
    expect(fs.existsSync(m.ctx.state.path('exports', made.exportId))).toBe(false)
    expect(made.sizeBytes).toBe(fs.statSync(held).size)
    expect(fs.statSync(held).mode & 0o777).toBe(0o600)
  })

  it('is read back a chunk at a time, whole, and opens only with the key made for it', async () => {
    const made = await exportForConsole()
    const bytes = await download(made.exportId)
    expect(bytes.length).toBeGreaterThan(EXPORT_CHUNK_BYTES)
    expect(bytes.equals(fs.readFileSync(m.ctx.state.path(HELD_EXPORTS, made.exportId)))).toBe(true)
    const file = () => (async function* () { yield bytes })()
    await expect(openBackup(file(), machineHolder(m.ctx.state))).rejects.toBeInstanceOf(WrongKey)
    expect((await openBackup(file(), holderFrom(parseKeyWords(made.key)!))).header.holds).toEqual(['hq', 'site'])
  })

  it('leaves the machine once downloaded, and is then refused in words', async () => {
    const made = await exportForConsole()
    expect(await ask({ op: 'backup.exportDone', exportId: made.exportId })).toMatchObject({ ok: true, result: { removed: true } })
    expect(fs.existsSync(m.ctx.state.path(HELD_EXPORTS, made.exportId))).toBe(false)
    expect(await ask({ op: 'backup.exportRead', exportId: made.exportId, offset: 0 })).toMatchObject({
      ok: false, refusal: { code: 'not_found', message: expect.stringMatching(/is no longer on hq-box.*Make another export/) },
    })
    expect(await ask({ op: 'backup.exportDone', exportId: made.exportId })).toMatchObject({ ok: true, result: { removed: false } })
  })

  it('is refused past its end', async () => {
    const made = await exportForConsole()
    expect(await ask({ op: 'backup.exportRead', exportId: made.exportId, offset: made.sizeBytes })).toMatchObject({
      ok: false, refusal: { code: 'malformed' },
    })
  })

  it('never reaches an export the machine admin made on the machine', async () => {
    const own = (await ask({ op: 'backup.exportNow' })).result
    expect(fs.existsSync(m.ctx.state.path('exports', own.exportId))).toBe(true)
    expect(await ask({ op: 'backup.exportRead', exportId: own.exportId, offset: 0 })).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
    expect(await ask({ op: 'backup.exportDone', exportId: own.exportId })).toMatchObject({ ok: true, result: { removed: false } })
    expect(fs.existsSync(m.ctx.state.path('exports', own.exportId))).toBe(true)
  })

  it('is removed a day after it was made if nobody downloads it; the machine admin’s exports stay', async () => {
    const made = await exportForConsole()
    const own = (await ask({ op: 'backup.exportNow' })).result
    await m.ctx.sleep(EXPORT_HELD_MS - 60_000)
    const later = await exportForConsole()
    sweepHeldExports(m.ctx)
    expect(fs.existsSync(m.ctx.state.path(HELD_EXPORTS, made.exportId))).toBe(true)
    await m.ctx.sleep(120_000)
    sweepHeldExports(m.ctx)
    expect(fs.existsSync(m.ctx.state.path(HELD_EXPORTS, made.exportId))).toBe(false)
    expect(fs.existsSync(m.ctx.state.path(HELD_EXPORTS, later.exportId))).toBe(true)
    expect(fs.existsSync(m.ctx.state.path('exports', own.exportId))).toBe(true)
  })
})
