/**
 * Whether hq's own site is running (getting-in spec, setup's Model access
 * step): one line in setup, and what the installer waits on. Read from the
 * default site's row and its last health report; never stored.
 */
import { prisma } from 'wasp/server'
import { parseSiteHealth } from '@agenthix/core'
import { pairingSecret } from '../sites/defaultSite'
import { currentDefaultSiteCause, type DefaultSiteCause } from '../sites/defaultSiteCause'

export type HqSiteState = {
  /**
   * connected — it is connected now; notConnected — it is configured but not
   * connected; upgrade — it runs another protocol version; unpaired — hq has no
   * pairing secret, so it has no site of its own.
   */
  state: 'connected' | 'notConnected' | 'upgrade' | 'unpaired'
  /** Docker on its machine, as its last report said; null when it has not reported. */
  dockerRunning: boolean | null
  /** Why it is not connected, as hq's machine reported it since the site was last seen; null when not known. */
  cause: DefaultSiteCause | null
}

type Row = { status: string; health: unknown; lastSeenAt?: Date | null } | null
type Reported = { cause: DefaultSiteCause; at: Date } | null

/** Pure: the state of the default site's row, given whether hq holds a pairing secret and the cause last reported. */
export function hqSiteStateOf(row: Row, paired: boolean, reported: Reported = null): HqSiteState {
  if (!paired || !row) return { state: 'unpaired', dockerRunning: null, cause: null }
  const health = row.health ? parseSiteHealth(row.health) : null
  const dockerRunning = health ? health.docker.running : null
  if (row.status === 'ONLINE') return { state: 'connected', dockerRunning, cause: null }
  if (row.status === 'VERSION_MISMATCH') return { state: 'upgrade', dockerRunning, cause: null }
  const current = reported && (!row.lastSeenAt || reported.at > row.lastSeenAt) ? reported.cause : null
  return { state: 'notConnected', dockerRunning, cause: current }
}

export async function hqSiteState(): Promise<HqSiteState> {
  const row = await prisma.executionSite.findFirst({ where: { isDefault: true }, select: { status: true, health: true, lastSeenAt: true } })
  return hqSiteStateOf(row, pairingSecret() !== null, currentDefaultSiteCause())
}
