import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { StreamMux, PACKAGE_MAX_BYTES, type StreamEvents } from '@agenthix/core'
import { ContentStream } from '../../server/hq/content/contentStream'
import { handlePackagesMissing, handlePackagesPut, setAfterPackageStored } from '../packageMethods'
import { hasPackage } from '../packageCache'
import { makeTransfer } from './transferFixture'

let root: string
const savedSiteRoot = process.env.SITE_ROOT
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
})
afterEach(async () => {
  setAfterPackageStored(null)
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

/** hq's opener mux wired straight to a site server mux, serving one handler. */
function openPut(params: unknown) {
  let site!: StreamMux
  const hq = new StreamMux('opener', { sendText: t => site.receiveText(t), sendBinary: async b => site.receiveBinary(b) })
  site = new StreamMux('server', { sendText: t => hq.receiveText(t), sendBinary: async b => hq.receiveBinary(b) })
  let resolveEnd!: () => void
  let rejectErr!: (e: string) => void
  const outcome = new Promise<void>((res, rej) => { resolveEnd = res; rejectErr = rej })
  site.onOpen = (id, _method, p) => {
    const { stream, events } = ContentStream.attach(site, id)
    site.accept(id, events)
    handlePackagesPut(stream, p).catch(err => { site.fail(id, 'handler_failed', err.message); stream.destroy() })
  }
  const events: StreamEvents = { onAccept() {}, onData() {}, onEnd: () => resolveEnd(), onError: (code, message) => rejectErr(`${code}: ${message}`) }
  const id = hq.open('packages.put', params, events)
  return { hq, id, outcome }
}

describe('package methods', () => {
  it('packages.missing answers with the digests it does not hold, and refuses a malformed request', async () => {
    const { ref } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    expect(await handlePackagesMissing({ refs: [ref] })).toEqual({ missing: [ref.digest] })
    await expect(handlePackagesMissing({ refs: [{ kind: 'agent', key: '../x', digest: ref.digest }] })).rejects.toThrow(/package references/)
  })

  it('packages.put stores verified content, ends its half, then runs the after-store hook', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    let hooked = false
    setAfterPackageStored(() => { hooked = true })
    const { hq, id, outcome } = openPut({ ref })
    await hq.write(id, new Uint8Array(body))
    hq.end(id)
    await outcome
    expect(await hasPackage(ref)).toBe(true)
    // The hook runs once the site's own end has flushed, just after hq sees it.
    await vi.waitFor(() => expect(hooked).toBe(true))
  })

  it('packages.put fails the stream, storing nothing, when verification fails', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    const { hq, id, outcome } = openPut({ ref: { ...ref, key: 'a2' } })
    await hq.write(id, new Uint8Array(body))
    hq.end(id)
    await expect(outcome).rejects.toMatch(/^handler_failed: /)
    expect(await hasPackage(ref)).toBe(false)
  })

  // A throwing after-store hook is caught and logged inside
  // handlePackagesPut — it must never fail a stream that has already ended,
  // since the content is already safely stored by the time the hook runs.
  it('stores the content and ends cleanly even when the after-store hook throws', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    setAfterPackageStored(() => { throw new Error('eviction blew up') })
    const { hq, id, outcome } = openPut({ ref })
    await hq.write(id, new Uint8Array(body))
    hq.end(id)
    await expect(outcome).resolves.toBeUndefined()
    expect(await hasPackage(ref)).toBe(true)
  })

  // The streamed path refuses a transfer whose decoded file
  // bytes exceed PACKAGE_MAX_BYTES, storing nothing.
  it('packages.put refuses a streamed transfer whose decoded bytes exceed the package size limit', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'big.bin': 'x'.repeat(9 * 1024 * 1024) })
    const { hq, id, outcome } = openPut({ ref })
    await hq.write(id, new Uint8Array(body))
    hq.end(id)
    await expect(outcome).rejects.toMatch(/^handler_failed: /)
    expect(await hasPackage(ref)).toBe(false)
  })

  it('packages.put stops reading the moment a transfer passes the cap — the stream is destroyed and nothing more is consumed', async () => {
    const stream = new PassThrough()
    let consumed = 0
    const emit = stream.emit.bind(stream)
    stream.emit = ((event: string, ...args: unknown[]) => {
      if (event === 'data') consumed += (args[0] as Buffer).length
      return emit(event, ...args)
    }) as typeof stream.emit
    const outcome = handlePackagesPut(stream as unknown as Parameters<typeof handlePackagesPut>[0], { ref: makeTransfer('agent', 'a1', { 'x.md': 'x' }).ref })
    const over = Buffer.alloc(PACKAGE_MAX_BYTES * 2 + 1)
    stream.write(over)
    await expect(outcome).rejects.toThrow(/exceeds the package size limit/)
    await vi.waitFor(() => expect(stream.destroyed).toBe(true))
    stream.write(Buffer.alloc(1024))
    await new Promise(resolve => setImmediate(resolve))
    expect(consumed).toBe(over.length)
  })
})
