import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { startedMoveOf } from '../../forms/MoveChange'
import { navigate } from '../../router'
import { HQ_PATH, sitePath } from '../../shell/menu'
import type { FleetHost } from '../dashboard/types'
import { useFleet } from '../dashboard/useFleet'
import { MoveHqFollow } from '../hq/MoveHqFollow'
import type { Move } from '../site/move/moveWords'
import type { Code } from '../site/move/WaitingForMachine'
import { MoveFollow } from '../site/move/MoveFollow'
import { HQ_KEY } from './things'
import { maintenanceAddress } from './panelAddress'

/**
 * A move followed where it always was: `/hq/move` for HQ's, `/sites/<fingerprint>/move` for a site's — the move just
 * started here, with its code, or one under way. With no move to follow, the address opens *Plan maintenance* on
 * the thing's page, with *Move* chosen. A notice names its move (`moveId`, from `?move=<id>`): that move is followed
 * while under way and shows its outcome once over, or, when the Fleet Console no longer holds it, the thing's page opens.
 */
export function MoveFollowPage({ thing, moveId: named = null, pollMs }: { thing: string; moveId?: string | null; pollMs?: number }) {
  const state = useFleet()
  const fleet = state.phase === 'loading' ? null : state.fleet
  const hq = thing === HQ_KEY
  const host = fleet ? (hq ? fleet.hosts.find(h => h.hqMachine) : fleet.hosts.find(h => h.fingerprint === thing)) ?? null : null
  const started = host ? startedMoveOf(host.fingerprint) : null
  const held = useHeldMove(named)
  // Once found, the move stays followed: the machine it left is gone from the fleet when a site's move finishes.
  const kept = useRef<{ thing: string; moveId: string; code: Code | null; fromName: string | null; consoleCame: string | null } | null>(null)
  if (kept.current && kept.current.thing !== thing) kept.current = null
  const found = named ?? started?.moveId ?? (host?.move?.role === 'sending' ? host.move.moveId : null)
  const moveId = found ?? kept.current?.moveId ?? null
  const nothing = named === null && fleet !== null && moveId === null
  const page = hq ? HQ_PATH : sitePath(thing)

  useEffect(() => {
    if (nothing) navigate(maintenanceAddress(page, thing, 'move'), { replace: true })
    else if (held === 'gone') navigate(page, { replace: true })
  }, [nothing, held, page, thing])

  if (!fleet || !moveId || held === 'gone' || (named !== null && held === null)) return null
  const code = started?.moveId === moveId ? started.code : kept.current?.moveId === moveId ? kept.current.code : null
  const read = typeof held === 'object' ? held : null
  if (hq) {
    const fromName = read ? nameOf(fleet.hosts, read.from) : host?.machineName ?? kept.current?.fromName ?? null
    const consoleCame = host && fleet.console.machineName === host.machineName ? window.location.host : kept.current?.consoleCame ?? null
    kept.current = { thing, moveId, code, fromName, consoleCame }
    return <MoveHqFollow moveId={moveId} fromName={fromName} hosts={fleet.hosts} code={code} consoleCame={consoleCame} pollMs={pollMs} />
  }
  // The machine it left may have gone with the move; the site was called by its name then.
  const fromName = read ? nameOf(fleet.hosts, read.from) ?? read.siteName : host?.machineName ?? kept.current?.fromName ?? null
  kept.current = { thing, moveId, code, fromName, consoleCame: null }
  return <MoveFollow moveId={moveId} fromName={fromName} code={code} pollMs={pollMs} />
}

const nameOf = (hosts: FleetHost[], fingerprint: string) => hosts.find(h => h.fingerprint === fingerprint)?.machineName ?? null

/** The move a notice names, read once: null while reading, 'gone' when the Fleet Console no longer holds it. */
function useHeldMove(moveId: string | null): Move | 'gone' | 'unread' | null {
  const [held, setHeld] = useState<Move | 'gone' | 'unread' | null>(null)
  useEffect(() => {
    if (!moveId) return
    let live = true
    api<{ move: Move }>(`/moves/${encodeURIComponent(moveId)}`)
      .then(({ move }) => { if (live) setHeld(move) })
      // Any other failure is the follow's to say, as it reads the move again.
      .catch((err: unknown) => { if (live) setHeld(err instanceof ApiError && err.status === 404 ? 'gone' : 'unread') })
    return () => { live = false }
  }, [moveId])
  return held
}
