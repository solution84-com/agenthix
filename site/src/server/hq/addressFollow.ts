/**
 * Following hq to a new address (host-management spec §13). hq tells this site the address it moves to
 * (`site.hqAddress`, core's `hqAddress.ts`) before it stops. The site keeps both: it goes on dialling the old one,
 * and tries the move check on the new one, with growing waits, until it passes. Only then does it switch — the
 * credential is never presented to an address that has not proved it holds this site's record. Told the address it
 * already uses, it stops waiting.
 *
 * A followed address outlives a restart: `pairedHqUrl` keeps the `HQ_URL` it was followed from, and pairing keeps
 * the followed address while `HQ_URL` is still that one (registration/pairing.ts). The pending move is kept the same
 * way, so `status` says the move has not completed until it has.
 */
import { prisma } from '#db'
import { HQ_SITE_CHANNEL_PATH, type MoveCheckOutcome, type SiteHqAddressResult } from '@agenthix/core'
import { runMoveCheck, type MoveCheckOptions } from '@agenthix/core/host-crypto'
import { hqUrlProblem } from '../control/hqUrlPolicy'
import { readConnectionToken } from './connectionToken'
import { Logger } from '../utils/logger'

const logger = new Logger('HqAddress')

const FIRST_WAIT_MS = 15_000
const LONGEST_WAIT_MS = 5 * 60_000
const ADDRESS = /^https?:\/\/[^/\s?#]+$/i

export type FollowDeps = {
  check: (o: MoveCheckOptions) => Promise<MoveCheckOutcome>
  /** Dials hq again from the stored link, once it names the new address. */
  reconnect: () => Promise<void>
  now: () => Date
  later: (run: () => void, ms: number) => () => void
}

/** The address as kept: no trailing slash. */
export const baseOf = (address: string) => address.trim().replace(/\/+$/, '')
const same = (a: string, b: string) => baseOf(a).toLowerCase() === baseOf(b).toLowerCase()
export const channelUrlOf = (base: string) => base.replace(/^http/, 'ws') + HQ_SITE_CHANNEL_PATH

const clearMove = { movingTo: null, movingSince: null, moveProblem: null }

/**
 * Which address pairing stores for `HQ_URL` (`base`): the one this site followed hq to, while `HQ_URL` is still the
 * one it was followed from, and the move it waits on with it; otherwise `HQ_URL` itself, and no move — whoever
 * changed `HQ_URL` (the host service, for `site hq-address`) checked it already.
 */
export async function pairedAddress(base: string): Promise<{ hqUrl: string; keepMove: boolean }> {
  const record = await prisma.hqConnection.findFirst()
  return record?.pairedHqUrl && same(record.pairedHqUrl, base) ? { hqUrl: baseOf(record.hqUrl), keepMove: true } : { hqUrl: base, keepMove: false }
}

export class AddressFollower {
  private cancel: (() => void) | null = null
  private attempt = 0
  private trying = false

  constructor(private readonly deps: FollowDeps) {}

  /** hq's `site.hqAddress`. */
  async take(params: unknown): Promise<SiteHqAddressResult> {
    const raw = (params as { address?: unknown } | null)?.address
    const address = typeof raw === 'string' && raw.length <= 512 ? baseOf(raw) : ''
    if (!ADDRESS.test(address)) return { taken: false, problem: 'That is not an address: a scheme and a host, perhaps with a port.' }
    const problem = hqUrlProblem(address)
    if (problem) return { taken: false, problem }
    const record = await prisma.hqConnection.findFirst()
    if (!record) return { taken: false, problem: 'This site holds no link to hq.' }
    if (same(address, record.hqUrl)) {
      await prisma.hqConnection.updateMany({ data: clearMove })
      this.stop()
      return { taken: true }
    }
    const since = record.movingTo && same(record.movingTo, address) && record.movingSince ? record.movingSince : this.deps.now()
    await prisma.hqConnection.updateMany({ data: { movingTo: address, movingSince: since, moveProblem: null } })
    logger.info(`hq says it moves to ${address}; this site keeps ${record.hqUrl} until the new address passes the check.`)
    this.attempt = 0
    this.schedule()
    return { taken: true }
  }

  /** At start: carries on with a move a restart interrupted. */
  async resume(): Promise<void> {
    const record = await prisma.hqConnection.findFirst()
    if (record?.movingTo) this.schedule()
  }

  /** One check of the new address; switches when it passes. Null when no move is waiting. */
  async tryNow(): Promise<MoveCheckOutcome | null> {
    if (this.trying) return null
    this.trying = true
    try {
      const record = await prisma.hqConnection.findFirst()
      if (!record?.movingTo) {
        this.stop()
        return null
      }
      const credential = readConnectionToken(record.connectionToken)
      if (!credential) return null
      const to = record.movingTo
      const outcome = await this.deps.check({ address: to, credential, subject: 'site' })
      if (outcome !== 'passed') {
        await prisma.hqConnection.updateMany({ where: { movingTo: to }, data: { moveProblem: outcome } })
        this.schedule()
        return outcome
      }
      const envBase = process.env.HQ_URL?.trim() ? baseOf(process.env.HQ_URL) : null
      await prisma.hqConnection.updateMany({
        data: { hqUrl: to, hqWsUrl: channelUrlOf(to), pairedHqUrl: record.pairedHqUrl ?? envBase, ...clearMove },
      })
      logger.info(`hq at ${to} passed the check: this site now uses it, and forgets ${record.hqUrl}.`)
      this.stop()
      await this.deps.reconnect()
      return outcome
    } finally {
      this.trying = false
    }
  }

  stop(): void {
    this.cancel?.()
    this.cancel = null
  }

  private schedule(): void {
    this.stop()
    const wait = Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** this.attempt)
    this.attempt = Math.min(this.attempt + 1, 8)
    this.cancel = this.deps.later(() => {
      this.cancel = null
      this.tryNow().catch(err => logger.error('checking hq’s new address failed', err))
    }, wait)
  }
}

export const addressFollower = new AddressFollower({
  check: runMoveCheck,
  // Imported when used: the connection manager imports the channel methods, which import this module.
  reconnect: async () => (await import('./hqConnection')).hqConnectionManager.restart(),
  now: () => new Date(),
  later: (run, ms) => {
    const timer = setTimeout(run, ms)
    timer.unref?.()
    return () => clearTimeout(timer)
  },
})
