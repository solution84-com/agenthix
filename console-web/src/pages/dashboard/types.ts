import type { HostFigures, ScheduledChangeNotice } from '@agenthix/core'
import type { HqFacts } from '../../api/session'

/** What `GET /api/fleet` answers (console/src/http/routes/fleet.ts). */
export type FleetHost = {
  fingerprint: string
  fingerprintShort: string
  hostId: string
  machineName: string
  siteName: string
  hqMachine: boolean
  siteRegistered: boolean
  connectedAt: string
  online: boolean
  since: string | null
  leftByItself: boolean
  leftAt: string | null
  /** Whether the fleet admins are told when it stops answering; absent is yes, and always yes for HQ's machine. */
  notifyIfSilent?: boolean
  /** It said it stops on purpose, and has not answered since. */
  stoppedAt?: string | null
  figures: HostFigures | null
  figuresAt: string | null
  /** The runs of the site it carries, as HQ last heard them; null when HQ has not said. */
  agents: { running: number; maxAtOnce: number; reportedAt: string } | null
  scheduled: ScheduledChangeNotice[]
  move: { moveId: string; role: 'sending' | 'receiving'; siteName: string; state: string; at: string | null } | null
  /** The last move to this machine ended without happening: it carries no site, and can take the next move. */
  endedMove?: { moveId: string; siteName: string; state: string } | null
}

/** A machine a fleet admin disconnected here, listed until removed from the list (console/src/state/disconnected.ts). */
export type DisconnectedMachine = {
  id: string
  fingerprint: string
  machineName: string
  siteName: string
  by: { userId: string; name: string }
  at: string
  /** Its site was restored onto this machine, which replaced it (adr-0119); nobody disconnected it. */
  replacedBy?: { machineName: string }
}

export type FleetResponse = {
  console: {
    machineName: string
    version: string
    fingerprintShort: string
    hq: 'connecting' | 'connected' | 'disconnected' | 'refused' | 'versionMismatch'
  }
  /** What HQ says of itself, for the words on the screen; null when it has not said. */
  hq: HqFacts | null
  hosts: FleetHost[]
  disconnected: DisconnectedMachine[]
}
