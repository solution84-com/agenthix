import { describe, expect, it } from 'vitest'
import { fingerprintOf, generateHostKeys, signTransferChunk, verifyTransferChunk } from '../crypto/index.js'
import { parseTransferChunk, parseTransferStep } from '../transfer.js'
import { utf8 } from '../crypto/webCrypto.js'

const bytes = utf8('SEALBK01 sealed bytes')

async function machines() {
  const old = await generateHostKeys('host')
  const fresh = await generateHostKeys('host')
  return { old, fresh, from: await fingerprintOf(old.identity), to: await fingerprintOf(fresh.identity) }
}

describe("a move's chunks", () => {
  it('pass only as the sending machine signed them, in their place, for their transfer', async () => {
    const { old, fresh, from, to } = await machines()
    const chunk = await signTransferChunk(old, { transferId: 'transfer-1', from, to, seq: 3, last: false }, bytes)
    expect(parseTransferChunk(chunk)).toEqual(chunk)
    expect(await verifyTransferChunk(chunk, old.identity, { from, to })).toEqual(bytes)

    const altered = { ...chunk, data: chunk.data.slice(0, -2) + (chunk.data.endsWith('A') ? 'BA' : 'AA') }
    expect(await verifyTransferChunk(altered, old.identity, { from, to })).toBeNull()
    expect(await verifyTransferChunk({ ...chunk, seq: 4 }, old.identity, { from, to })).toBeNull()
    expect(await verifyTransferChunk({ ...chunk, last: true }, old.identity, { from, to })).toBeNull()
    expect(await verifyTransferChunk({ ...chunk, transferId: 'transfer-2' }, old.identity, { from, to })).toBeNull()
    // Made by anyone else — hq, or the receiving machine itself — it does not pass as the old machine's.
    const forged = await signTransferChunk(fresh, { transferId: 'transfer-1', from, to, seq: 3, last: false }, bytes)
    expect(await verifyTransferChunk(forged, old.identity, { from, to })).toBeNull()
    // Signed for another receiver, it does not pass for this one.
    expect(await verifyTransferChunk(chunk, old.identity, { from, to: from })).toBeNull()
  })

  it('reads only well-formed chunks and steps', () => {
    expect(parseTransferChunk({ transferId: 'x', seq: 0, last: false, data: '', sig: 'a'.repeat(86) })).toBeNull()
    expect(parseTransferChunk({ transferId: 'transfer-1', seq: -1, last: false, data: '', sig: 'a'.repeat(86) })).toBeNull()
    expect(parseTransferStep({ step: 'ready' })).toEqual({ step: 'ready' })
    expect(parseTransferStep({ step: 'gaveBack' })).toBeNull()
    expect(parseTransferStep({ step: 'released', credential: 'short', takeoverMs: 1000, change: {} })).toBeNull()
    expect(parseTransferStep({ step: 'shell' })).toBeNull()
  })
})
