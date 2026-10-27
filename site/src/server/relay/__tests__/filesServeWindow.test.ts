/**
 * `files.serve` on a stream a relay opened with a window: the file is read only as fast as the relay grants credit,
 * so a slow browser holds the site's read back rather than filling the relay.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  FILES_SERVE_METHOD, StreamMux, createStreamHeadReader, fileVersion, type LocationRef,
} from '@agenthix/core'
import { locationDir } from '../../storage/paths'
import { ContentStream } from '../../hq/content/contentStream'
import { createFilesServe } from '../filesServe'
import { ReadSlots } from '../readSlots'
import { RELAY_ID, SITE_ID, fixedKeys, makeKey, signToken, ticketClaims } from './ticketKit'

const hqKey = makeKey('hq-1')
const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-0001' }
const FILE = randomBytes(4 * 1024 * 1024 + 7)
const WINDOW = 256 * 1024
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

let root: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  await fs.mkdir(locationDir(loc), { recursive: true })
  await fs.writeFile(path.join(locationDir(loc), 'big.bin'), FILE)
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

describe('files.serve under a window @SC-1499', () => {
  it('sends no more than the window until the relay grants credit, then the whole file', async () => {
    const s = await fs.stat(path.join(locationDir(loc), 'big.bin'))
    const ticket = signToken(hqKey, ticketClaims(loc, 'big.bin', fileVersion(s.size, s.mtimeMs), { purpose: 'download' }))
    const handler = createFilesServe({ siteId: SITE_ID, relayId: RELAY_ID, keys: fixedKeys({ keys: [hqKey.jwk] }), slots: new ReadSlots() })

    let site!: StreamMux
    const relay = new StreamMux('opener', { sendText: t => site.receiveText(t), sendBinary: async b => site.receiveBinary(b) })
    site = new StreamMux('server', { sendText: t => relay.receiveText(t), sendBinary: async b => relay.receiveBinary(b) })
    let settled = false
    site.onOpen = (id, _m, params) => {
      const { stream, events } = ContentStream.attach(site, id)
      site.accept(id, events)
      void handler(stream, params).then(() => { settled = true })
    }
    const chunks: Buffer[] = []
    let ended = false
    let failed: string | null = null
    const id = relay.open(FILES_SERVE_METHOD, { ticket }, {
      onData: p => { chunks.push(Buffer.from(p)) },
      onEnd: () => { ended = true },
      onError: code => { failed = code },
    }, { window: WINDOW })

    for (let i = 0; i < 50 && Buffer.concat(chunks).length < WINDOW; i++) await settle()
    await settle()
    expect(Buffer.concat(chunks).length).toBe(WINDOW)
    expect(settled).toBe(false)

    for (let i = 0; i < 500 && !ended; i++) {
      relay.credit(id, WINDOW)
      await settle()
    }
    expect(failed).toBeNull()
    expect(ended).toBe(true)
    const read = createStreamHeadReader().push(new Uint8Array(Buffer.concat(chunks)))
    if (read.state !== 'head') throw new Error(`no head: ${read.state}`)
    expect(read.head.status).toBe(200)
    expect(createHash('sha256').update(read.rest).digest('hex')).toBe(createHash('sha256').update(FILE).digest('hex'))
  })
})
