import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { MoveHqForm } from '../pages/hq/MoveHqForm'
import { MoveForm, type StartedMove, type StartedSiteMove } from '../pages/site/move/MoveForm'
import type { Code } from '../pages/site/move/WaitingForMachine'
import { navigate } from '../router'
import { HQ_PATH, sitePath } from '../shell/menu'

/**
 * Moves started in this tab, by the machine they leave: the new machine's one-time code is given only once, in the
 * answer to starting the move, and the move is followed on its own page (`movePath`), where this is read.
 */
const started = new Map<string, { moveId: string; code: Code | null }>()

export const startedMoveOf = (fingerprint: string) => started.get(fingerprint) ?? null
export const forgetStartedMoves = () => started.clear()

/** Where a move is followed once it starts, as before: HQ's at `/hq/move`, a site's under the site. */
export const movePath = (hq: boolean, fingerprint: string): string => (hq ? `${HQ_PATH}/move` : `${sitePath(fingerprint)}/move`)

/** *Move* (spec §13), HQ's or a site's, before it starts. Once started, it is followed on its own page. */
export function MoveChange({ host, hq, fleet, pollMs }: {
  host: FleetHost
  /** Moving HQ, with its own site, from HQ's machine. */
  hq: boolean
  fleet: FleetResponse
  pollMs?: number
}) {
  const follow = (moveId: string, code: Code | null) => {
    started.set(host.fingerprint, { moveId, code })
    navigate(movePath(hq, host.fingerprint))
  }
  if (hq) {
    return (
      <MoveHqForm host={host} hosts={fleet.hosts} address={fleet.hq?.address ?? null} console={{ machineName: fleet.console.machineName, here: window.location.host }} pollMs={pollMs}
        onStarted={(m: StartedMove, givenAt) => follow(m.moveId, { code: m.code, expiresAt: m.expiresAt, givenAt })} />
    )
  }
  return (
    <MoveForm host={host} onStarted={(m: StartedSiteMove, givenAt) =>
      follow(m.moveId, m.code && m.expiresAt ? { code: m.code, expiresAt: m.expiresAt, givenAt } : null)} />
  )
}
