/**
 * Which relay this site holds a line to (adr-0153), as hq assigns it with `relay.assign` on the control channel.
 *
 * - The first assignment opens a line.
 * - The same relay at the same address again renews the pass: the open line carries on, and the next dial presents it.
 * - Another relay (or another address) opens a new line beside the old one; the old one is retired only once the new
 *   one is up, and carries the streams it has open to their end, so a move never cuts an open file off.
 *
 * The site dials only the address hq gave (`resolveLineUrl`), and never listens.
 */
import { prisma } from '#db'
import { APP_SERVE_METHOD, BUNDLE_METHODS, FILES_SERVE_METHOD, type RelayAssignParams, type RelayAssignResult } from '@agenthix/core'
import { createAppServe } from '../livePreviews/apps/appServe'
import { createBundleRead, createBundleWrite } from '../livePreviews/bundles/bundleStreams'
import { createFilesServe } from './filesServe'
import { hqKeySet, type KeySetSource } from './hqKeySet'
import { resolveLineUrl } from './lineUrl'
import { fileReadSlots, type ReadSlots } from './readSlots'
import { RelayLine, type RelayLineOptions } from './relayLine'
import { Logger } from '../utils/logger'

const logger = new Logger('RelayLines')

const MAX_ID_LENGTH = 512
const MAX_PASS_LENGTH = 8192

type Where = { hqWsUrl: string; siteId: string }

export type RelayLinesDeps = {
  where?: () => Promise<Where | null>
  keys?: KeySetSource
  slots?: ReadSlots
  makeLine?: (options: RelayLineOptions) => RelayLine
}

function readParams(params: unknown): RelayAssignParams | null {
  if (typeof params !== 'object' || params === null) return null
  const p = params as Record<string, unknown>
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH
  if (!id(p.relayId) || typeof p.lineUrl !== 'string') return null
  if (typeof p.pass !== 'string' || p.pass.length === 0 || p.pass.length > MAX_PASS_LENGTH) return null
  if (typeof p.passExpiresAt !== 'number' || !Number.isFinite(p.passExpiresAt)) return null
  return { relayId: p.relayId, lineUrl: p.lineUrl, pass: p.pass, passExpiresAt: p.passExpiresAt }
}

async function storedWhere(): Promise<Where | null> {
  const [conn, config] = await Promise.all([prisma.hqConnection.findFirst(), prisma.siteConfig.findFirst()])
  if (!conn?.hqWsUrl || !config) return null
  return { hqWsUrl: conn.hqWsUrl, siteId: config.siteId }
}

export class RelayLines {
  private current: RelayLine | null = null
  private pending: RelayLine | null = null

  constructor(private readonly deps: RelayLinesDeps = {}) {}

  /** The line in use: the one that came up last. */
  get line(): RelayLine | null {
    return this.current
  }

  get waiting(): RelayLine | null {
    return this.pending
  }

  async assign(params: unknown): Promise<RelayAssignResult> {
    const p = readParams(params)
    if (!p) return { taken: false, problem: 'The assignment is not one this site reads: it needs a relay id, a line address and a pass.' }
    const where = await (this.deps.where ?? storedWhere)()
    if (!where) return { taken: false, problem: 'This site has no link to HQ stored, so it has no address to resolve the line against.' }
    const url = resolveLineUrl(p.lineUrl, where.hqWsUrl)
    if (!url) return { taken: false, problem: 'The line address is not a WebSocket or HTTP address this site dials.' }

    const same = (line: RelayLine | null) => line !== null && line.relayId === p.relayId && line.url === url
    if (same(this.pending)) {
      this.pending!.setPass(p.pass)
      return { taken: true }
    }
    if (same(this.current)) {
      this.current!.setPass(p.pass)
      // An assignment back to the line in use calls off a move that has not come up yet.
      this.pending?.stop()
      this.pending = null
      return { taken: true }
    }

    this.pending?.stop()
    const line = this.newLine(p, url, where.siteId)
    this.pending = line
    line.start()
    logger.info(`Assigned to relay ${p.relayId}; opening its line`)
    return { taken: true }
  }

  /** Every line closed at once: the link to hq has ended. hq assigns again when it is back. */
  stop(): void {
    this.pending?.stop()
    this.current?.stop()
    this.pending = null
    this.current = null
  }

  private newLine(p: RelayAssignParams, url: string, siteId: string): RelayLine {
    const ticketed = { siteId, relayId: p.relayId, keys: this.deps.keys ?? hqKeySet }
    const options: RelayLineOptions = {
      url,
      relayId: p.relayId,
      siteId,
      pass: p.pass,
      methods: {
        [FILES_SERVE_METHOD]: createFilesServe({
          siteId,
          relayId: p.relayId,
          keys: this.deps.keys ?? hqKeySet,
          slots: this.deps.slots ?? fileReadSlots,
        }),
        [APP_SERVE_METHOD]: createAppServe(ticketed),
        [BUNDLE_METHODS.read]: createBundleRead(ticketed),
        [BUNDLE_METHODS.write]: createBundleWrite(ticketed),
      },
      onUp: () => this.promote(line),
    }
    const line = (this.deps.makeLine ?? (o => new RelayLine(o)))(options)
    return line
  }

  private promote(line: RelayLine): void {
    if (this.pending !== line) return
    const old = this.current
    this.current = line
    this.pending = null
    if (old && old !== line) old.retire()
  }
}

export const relayLines = new RelayLines()
