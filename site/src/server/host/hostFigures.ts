/**
 * What this site takes from the host service that runs it (host-management spec §6, §8): the machine's ceilings
 * for agent containers, and whether the agent protections hold. Read from the figures socket
 * (`HOST_FIGURES_SOCKET`), which answers `figures.read` and nothing else.
 *
 * Only those two are kept. The figures also carry the machine's resource use, its Docker version and its other
 * installs, which stay on the machine: nothing here passes them on, to hq or anywhere (spec §10).
 *
 * A site the host service runs starts no agent until the protections hold, and a reading it cannot get, or one
 * the host service checked too long ago, counts as not holding. A site with no `HOST_FIGURES_SOCKET` is not run
 * by a host service (development, or the old compose install), and keeps its own ceilings and no protections.
 */
import net from 'node:net'
import {
  BRANDING, parseHostCeilings, percentOf, type HostCeilings, type ProtectionDrop, type ProtectionRule, type ScheduledChangeNotice,
} from '@agenthix/core'
import { parseScheduledNotices } from './scheduledRelay'
import { Logger } from '../utils/logger'

const logger = new Logger('hostFigures')

/** How often the site reads the figures; a change of ceilings reaches new runs within this. */
export const HOST_FIGURES_REFRESH_MS = 30_000
const READ_TIMEOUT_MS = 5_000
const MAX_ANSWER_BYTES = 1024 * 1024
/** The host service checks the protections every minute; a check older than this does not count. */
export const PROTECTIONS_FRESH_MS = 3 * 60_000

export type HostReading = {
  ceilings: HostCeilings
  protections: { holding: boolean; checkedAt: number; rules: ProtectionRule[]; drops: ProtectionDrop[] | null; publicAddressKnown: boolean }
  /** The machine's memory and processor use, as whole percents only (live preview capacity); null when not given. */
  use: { memoryPercent: number | null; cpuPercent: number | null }
  readAt: number
}

/**
 * The rules a live preview needs beyond an agent's (live preview spec section 6): `public-address` too, once the
 * machine knows a public address it is seen from.
 */
export const LIVE_PREVIEW_RULES: readonly ProtectionRule[] = ['private-addresses']

export function livePreviewRules(publicAddressKnown: boolean): readonly ProtectionRule[] {
  return publicAddressKnown ? [...LIVE_PREVIEW_RULES, 'public-address'] : LIVE_PREVIEW_RULES
}

const RULE_NAMES: readonly ProtectionRule[] = ['machine-ports', 'published-ports', 'metadata-address', 'private-addresses', 'public-address']

function readDrops(v: unknown): ProtectionDrop[] | null {
  if (!Array.isArray(v)) return null
  return v.flatMap((d): ProtectionDrop[] => {
    const o = d as { rule?: unknown; source?: unknown; dropped?: unknown } | null
    if (!o || !RULE_NAMES.includes(o.rule as ProtectionRule) || typeof o.source !== 'string' || !Number.isSafeInteger(o.dropped)) return []
    return [{ rule: o.rule as ProtectionRule, source: o.source, dropped: o.dropped as number }]
  })
}

function readUse(v: unknown): HostReading['use'] {
  const r = v as { cpuLoad?: unknown; cpus?: unknown; memory?: { usedBytes?: unknown; totalBytes?: unknown } } | null | undefined
  const memoryPercent = typeof r?.memory?.usedBytes === 'number' && typeof r.memory.totalBytes === 'number'
    ? percentOf(r.memory.usedBytes, r.memory.totalBytes) : null
  const cpuPercent = typeof r?.cpuLoad === 'number' && typeof r.cpus === 'number' ? percentOf(r.cpuLoad, r.cpus) : null
  return { memoryPercent: memoryPercent === null ? null : Math.min(100, memoryPercent), cpuPercent }
}

export type FiguresRead = (socket: string) => Promise<unknown>

/** One `figures.read` on the socket: the request line, then the answer's last line. */
export const readFiguresSocket: FiguresRead = socket =>
  new Promise((resolve, reject) => {
    const conn = net.connect(socket)
    let buffer = ''
    const fail = (err: Error) => {
      conn.destroy()
      reject(err)
    }
    conn.setEncoding('utf8')
    conn.setTimeout(READ_TIMEOUT_MS, () => fail(new Error('The host service did not answer on its figures socket.')))
    conn.on('error', fail)
    conn.on('connect', () => conn.write(`${JSON.stringify({ op: 'figures.read' })}\n`))
    conn.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > MAX_ANSWER_BYTES) fail(new Error('The host service’s figures were too long.'))
    })
    conn.on('end', () => {
      const last = buffer.trim().split('\n').pop() ?? ''
      try {
        resolve(JSON.parse(last))
      } catch {
        reject(new Error('The host service’s figures were not JSON.'))
      }
    })
  })

/** The ceilings and the protections out of an answer, checked; null when the answer is not figures. */
export function parseReading(answer: unknown, readAt: number): HostReading | null {
  if (!answer || typeof answer !== 'object') return null
  const a = answer as { ok?: unknown; result?: unknown }
  if (a.ok !== true || !a.result || typeof a.result !== 'object') return null
  const r = a.result as { ceilings?: unknown; protections?: unknown; resources?: unknown }
  const ceilings = parseHostCeilings(r.ceilings)
  const p = r.protections as { holding?: unknown; checkedAt?: unknown; rules?: unknown; drops?: unknown; publicAddressKnown?: unknown } | null | undefined
  const checkedAt = typeof p?.checkedAt === 'string' ? Date.parse(p.checkedAt) : NaN
  if (!ceilings || typeof p?.holding !== 'boolean' || Number.isNaN(checkedAt)) return null
  const rules = Array.isArray(p.rules) ? RULE_NAMES.filter(n => (p.rules as unknown[]).includes(n)) : []
  return { ceilings, protections: { holding: p.holding, checkedAt, rules, drops: readDrops(p.drops), publicAddressKnown: p.publicAddressKnown === true }, use: readUse(r.resources), readAt }
}

/** What a run that did not start says, in the words the person reads in its conversation. */
export const PROTECTIONS_MISSING =
  'This run did not start: the protections that keep agents from reaching the machine this site runs on are not ' +
  `in place. Whoever looks after that machine can see why with: ${BRANDING.cliCommand} status`

export class HostFigures {
  private last: HostReading | null = null
  private listeners: (() => void)[] = []
  // The scheduled changes' notices the host service offers, which the site passes to hq (scheduledRelay.ts).
  private notices: ScheduledChangeNotice[] = []
  private noticeListeners = new Set<() => void>()

  constructor(
    private readonly socket: string | undefined,
    private readonly read: FiguresRead = readFiguresSocket,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether a host service runs this site. */
  get managed(): boolean {
    return !!this.socket
  }

  /** The machine's ceilings as last read; null when no host service runs this site, or none was read yet. */
  machineCeilings(): HostCeilings | null {
    return this.last?.ceilings ?? null
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  scheduledNotices(): ScheduledChangeNotice[] {
    return this.notices
  }

  /** Called after each reading whose notices differ from the last; returns the function that stops it. */
  onScheduledNotices(listener: () => void): () => void {
    this.noticeListeners.add(listener)
    return () => { this.noticeListeners.delete(listener) }
  }

  async refresh(): Promise<HostReading | null> {
    if (!this.socket) return null
    let reading: HostReading | null
    try {
      const answer = await this.read(this.socket)
      reading = parseReading(answer, this.now())
      const notices = parseScheduledNotices(answer)
      if (JSON.stringify(notices) !== JSON.stringify(this.notices)) {
        this.notices = notices
        for (const l of this.noticeListeners) l()
      }
    } catch (err) {
      logger.warn(`could not read the host service’s figures: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
    if (!reading) {
      logger.warn('the host service’s figures socket answered something that is not figures')
      return null
    }
    // A reading that fails keeps the last ceilings: they still bound containers. It never keeps the protections.
    const changed = JSON.stringify(reading.ceilings) !== JSON.stringify(this.last?.ceilings ?? null)
    this.last = reading
    if (changed) for (const l of this.listeners) l()
    return reading
  }

  /**
   * Why no agent may start now; null when one may. Read again when the last reading is older than the refresh,
   * so a run never starts on a reading the host service has since changed by more than that.
   */
  async protectionsProblem(): Promise<string | null> {
    if (!this.socket) return null
    const fresh = this.last && this.now() - this.last.readAt < HOST_FIGURES_REFRESH_MS ? this.last : await this.refresh()
    if (!fresh) return PROTECTIONS_MISSING
    const { holding, checkedAt } = fresh.protections
    return holding && this.now() - checkedAt <= PROTECTIONS_FRESH_MS ? null : PROTECTIONS_MISSING
  }

  /**
   * Why no live preview may run now; null when one may. A live preview needs the agents' protections and, for the
   * live-preview part of the range, the rules that keep it off private addresses and, once known, the machine's public
   * address. Without a host service (development)
   * nothing protects agents either, and nothing is asked.
   */
  async livePreviewProtectionsProblem(): Promise<string | null> {
    const agents = await this.protectionsProblem()
    if (agents || !this.socket) return agents
    const rules = this.last?.protections.rules ?? []
    const missing = livePreviewRules(this.last?.protections.publicAddressKnown ?? false).filter(r => !rules.includes(r))
    return missing.length
      ? `the host service does not apply the rule${missing.length === 1 ? '' : 's'} ${missing.join(', ')} for live previews. Upgrade the host service on this machine.`
      : null
  }

  /** What each rule dropped, by agent address, as last read; null where the host service does not count them. */
  drops(): ProtectionDrop[] | null {
    return this.last?.protections.drops ?? null
  }

  /** The machine's memory and processor use as last read, in whole percents. */
  use(): HostReading['use'] {
    return this.last?.use ?? { memoryPercent: null, cpuPercent: null }
  }

  /** Every `HOST_FIGURES_REFRESH_MS`, after the first reading at boot. Returns the stop function. */
  start(): () => void {
    if (!this.socket) return () => {}
    const timer = setInterval(() => { void this.refresh() }, HOST_FIGURES_REFRESH_MS)
    timer.unref?.()
    return () => clearInterval(timer)
  }
}

export const hostFigures = new HostFigures(process.env.HOST_FIGURES_SOCKET?.trim() || undefined)
