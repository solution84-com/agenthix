import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DamagedBackup, WrongKey, holderFrom, newHeader, openBackup, readHeader, rewrapBackup, sealBackup, type SealedRecord,
} from '../seal'

const header = () => newHeader({
  id: 'b1', kind: 'nightly', namespace: 'agenthix', machine: 'hq-box', siteName: 'hq-box', holds: ['hq', 'site'],
  night: '2026-10-12', takenAt: '2026-10-13T02:00:00.000Z', version: '0.2.0', hqAddress: 'https://hq.acme.example',
})

async function* records(parts: Record<string, Buffer>): AsyncGenerator<SealedRecord> {
  for (const [name, bytes] of Object.entries(parts)) {
    yield { type: 'begin', name }
    yield { type: 'data', bytes }
    yield { type: 'end' }
  }
}

async function collect(gen: AsyncIterable<Buffer>): Promise<Buffer> {
  const out: Buffer[] = []
  for await (const b of gen) out.push(b)
  return Buffer.concat(out)
}

async function* of(bytes: Buffer, size = 7000): AsyncGenerator<Buffer> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size)
}

async function readAll(file: Buffer, secret: Buffer): Promise<Record<string, Buffer>> {
  const { records: rs } = await openBackup(of(file), holderFrom(secret))
  const parts: Record<string, Buffer[]> = {}
  let current = ''
  for await (const r of rs) {
    if (r.type === 'begin') parts[(current = r.name)] = []
    else if (r.type === 'data') parts[current].push(r.bytes)
  }
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Buffer.concat(v)]))
}

const secret = crypto.randomBytes(32)
const big = crypto.randomBytes(3 * 1024 * 1024 + 123)

describe('a sealed backup @SC-828', () => {
  it('opens with its key, every part as it was', async () => {
    const file = await collect(sealBackup(header(), holderFrom(secret).publicKey, records({ 'hq/db': Buffer.from('dump'), 'site/data': big })))
    const parts = await readAll(file, secret)
    expect(parts['hq/db'].toString()).toBe('dump')
    expect(parts['site/data'].equals(big)).toBe(true)
  })

  it('cannot be read without its key: nothing of what it holds is in the file, and another key is refused', async () => {
    const file = await collect(sealBackup(header(), holderFrom(secret).publicKey, records({ 'hq/secrets': Buffer.from('SECRETS_MASTER_KEY=abc123') })))
    expect(file.includes(Buffer.from('abc123'))).toBe(false)
    await expect(openBackup(of(file), holderFrom(crypto.randomBytes(32)))).rejects.toBeInstanceOf(WrongKey)
    await expect(openBackup(of(file), holderFrom(crypto.randomBytes(32)))).rejects.toThrow('That key does not open this backup.')
  })

  it('shows its description without the key', async () => {
    const file = await collect(sealBackup(header(), holderFrom(secret).publicKey, records({})))
    expect(await readHeader(of(file))).toMatchObject({ machine: 'hq-box', night: '2026-10-12', holds: ['hq', 'site'] })
  })

  it('refuses a changed description, a changed byte and a backup cut short', async () => {
    const file = await collect(sealBackup(header(), holderFrom(secret).publicKey, records({ x: big })))
    const renamed = Buffer.from(file.toString('latin1').replace('"hq-box"', '"hq-bax"'), 'latin1')
    await expect(readAll(renamed, secret)).rejects.toBeInstanceOf(WrongKey)
    const flipped = Buffer.from(file)
    flipped[flipped.length - 40] ^= 1
    await expect(readAll(flipped, secret)).rejects.toBeInstanceOf(DamagedBackup)
    await expect(readAll(file.subarray(0, file.length - 60), secret)).rejects.toBeInstanceOf(DamagedBackup)
    // Cut at a chunk boundary: everything that is there authenticates, but the end is missing.
    const lastChunk = 4 + 1 + 16
    await expect(readAll(file.subarray(0, file.length - lastChunk), secret)).rejects.toThrow(/ends before its last part/)
  })

  it('is passed to another holder without being decrypted, and then opens only with the new key', async () => {
    const file = await collect(sealBackup(header(), holderFrom(secret).publicKey, records({ x: big })))
    const other = crypto.randomBytes(15)
    await expect(rewrapBackup(of(file), holderFrom(crypto.randomBytes(32)), holderFrom(other).publicKey)).rejects.toBeInstanceOf(WrongKey)
    const copy = await collect((await rewrapBackup(of(file), holderFrom(secret), holderFrom(other).publicKey)).bytes)
    expect((await readAll(copy, other)).x.equals(big)).toBe(true)
    await expect(openBackup(of(copy), holderFrom(secret))).rejects.toBeInstanceOf(WrongKey)
  })

  it('refuses a file that is not a sealed backup', async () => {
    await expect(readHeader(of(Buffer.from('PGDMP plain dump')))).rejects.toThrow('not a sealed backup')
  })
})
