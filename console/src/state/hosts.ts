/**
 * The machines this Fleet Console manages: each host service's identity, pinned when a fleet admin confirmed its
 * fingerprint (spec §6). An envelope is accepted only from a pinned identity and sealed only to one, so this file is
 * the console's whole idea of who is who; hq's list of hosts says only who is online.
 */
import { fingerprintOf, isHostIdentity } from '@agenthix/core/host-crypto'
import { isFingerprint, type HostIdentity } from '@agenthix/core'
import { DisconnectedMachines } from './disconnected'
import type { StateFolder } from './folder'

const FILE = 'hosts.json'

export type PinnedHost = {
  fingerprint: string
  /** hq's id for the host service, from `join.accept`. */
  hostId: string
  identity: HostIdentity
  machineName: string
  /**
   * The machine's name while it carries a site, which is always called by its machine's name; empty while it carries
   * none (a move's new machine, until the move finishes).
   */
  siteName: string
  /** The site's id in hq once `site.register` succeeded; null until then. */
  executionSiteId: string | null
  connectedAt: string
  /** The fleet admin who confirmed it; null when the machine admin joined hq's own machine at install. */
  connectedBy: string | null
  /** hq's own machine, joined at install: it carries hq and its default site. */
  hqMachine?: boolean
  /**
   * Whether the fleet admins are told when this machine stops answering (hosts/silence.ts); absent is yes. Asked when
   * it joins, changed on its page. Never asked of hq's machine, which is always told about.
   */
  notifyIfSilent?: boolean
}

/** Whether the fleet admins are told when this machine stops answering: always for hq's machine, which is HQ itself. */
export const notifiesIfSilent = (h: Pick<PinnedHost, 'hqMachine' | 'notifyIfSilent'>): boolean => h.hqMachine === true || h.notifyIfSilent !== false

/** The words for a machine in the record: its name, which is its site's too. Never "a site on a machine". */
export const listedAs = (h: Pick<PinnedHost, 'machineName'>): string => h.machineName

export class PinnedHosts {
  private hosts: PinnedHost[]
  /** Machines a fleet admin disconnected, still listed until removed from the list (spec §6). */
  readonly disconnected: DisconnectedMachines

  constructor(private readonly state: StateFolder) {
    this.hosts = PinnedHosts.read(state)
    this.disconnected = new DisconnectedMachines(state)
  }

  list(): PinnedHost[] {
    return [...this.hosts]
  }

  byFingerprint(fingerprint: string): PinnedHost | null {
    return this.hosts.find(h => h.fingerprint === fingerprint) ?? null
  }

  byHostId(hostId: string): PinnedHost | null {
    return this.hosts.find(h => h.hostId === hostId) ?? null
  }

  /** The identity a fingerprint names, only when it is a pinned host service. */
  identity(fingerprint: string): HostIdentity | null {
    const host = this.byFingerprint(fingerprint)
    return host && host.identity.role === 'host' ? host.identity : null
  }

  async pin(host: PinnedHost): Promise<void> {
    if (host.identity.role !== 'host' || (await fingerprintOf(host.identity)) !== host.fingerprint) {
      throw new Error('Only a host service is pinned, under its own fingerprint.')
    }
    this.hosts = [...this.hosts.filter(h => h.fingerprint !== host.fingerprint && h.hostId !== host.hostId), host]
    this.save()
    this.disconnected.forget(host.fingerprint)
  }

  update(fingerprint: string, change: Partial<Pick<PinnedHost, 'executionSiteId' | 'siteName' | 'notifyIfSilent'>>): void {
    this.hosts = this.hosts.map(h => (h.fingerprint === fingerprint ? { ...h, ...change } : h))
    this.save()
  }

  /**
   * The machine that carries hq, from the Fleet Console's own record of the move of hq it carried out (move/moves.ts)
   * — never from what hq says. One machine at a time.
   */
  markHqMachine(fingerprint: string): void {
    if (!this.byFingerprint(fingerprint)) return
    this.hosts = this.hosts.map(({ hqMachine: _was, ...h }) => (h.fingerprint === fingerprint ? { ...h, hqMachine: true } : h))
    this.save()
  }

  /** Unpins: from now on its envelopes are refused and nothing is sealed to it. */
  remove(fingerprint: string): void {
    this.hosts = this.hosts.filter(h => h.fingerprint !== fingerprint)
    this.save()
  }

  private save(): void {
    this.state.writeJson([FILE], { hosts: this.hosts })
  }

  private static read(state: StateFolder): PinnedHost[] {
    const data = state.readJson(FILE) as { hosts?: unknown } | null
    if (!data) return []
    if (!Array.isArray(data.hosts)) throw new Error(`${state.path(FILE)} holds no list of hosts.`)
    return data.hosts.map(h => {
      if (!isPinnedHost(h)) throw new Error(`${state.path(FILE)} holds an entry that is not a pinned host.`)
      return h
    })
  }
}

function isPinnedHost(v: unknown): v is PinnedHost {
  if (!v || typeof v !== 'object') return false
  const h = v as Record<string, unknown>
  return isFingerprint(h.fingerprint) && typeof h.hostId === 'string' && isHostIdentity(h.identity) &&
    typeof h.machineName === 'string' && typeof h.siteName === 'string' &&
    (h.executionSiteId === null || typeof h.executionSiteId === 'string') &&
    typeof h.connectedAt === 'string' && (h.connectedBy === null || typeof h.connectedBy === 'string') &&
    (h.hqMachine === undefined || typeof h.hqMachine === 'boolean') &&
    (h.notifyIfSilent === undefined || typeof h.notifyIfSilent === 'boolean')
}
