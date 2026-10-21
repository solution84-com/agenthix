/**
 * A machine's figures are read, not pushed (spec §6, `figures.read`): when the fleet is shown, each machine online
 * whose figures are missing or older than a minute is asked again. At most one ask per machine is out at a time, the
 * screen does not wait for it — the answer is kept in `Presence` (commands.ts) for the next read — and it is not
 * recorded as an action: nobody changed anything.
 */
import type { HostActor } from '@agenthix/core'
import type { PinnedHosts } from '../state/hosts'
import type { HostCommands } from './commands'
import type { Presence } from './presence'

export const FIGURES_FRESH_MS = 60_000

export class FiguresRefresh {
  private readonly asking = new Set<string>()

  constructor(
    private readonly hosts: PinnedHosts,
    private readonly presence: Presence,
    private readonly commands: HostCommands,
    private readonly now: () => number = Date.now,
  ) {}

  /** Asks every machine that needs it, on behalf of the person looking; returns at once. */
  refreshStale(by: HostActor): void {
    for (const host of this.hosts.list()) {
      const p = this.presence.of(host.fingerprint)
      if (!p.online || p.leftAt !== null || this.asking.has(host.fingerprint)) continue
      if (p.figuresAt && this.now() - Date.parse(p.figuresAt) < FIGURES_FRESH_MS) continue
      this.asking.add(host.fingerprint)
      this.commands.send(host.fingerprint, { op: 'figures.read' }, by)
        .catch(() => {
          // Not answered, refused or offline: the next read of the fleet asks again.
        })
        .finally(() => this.asking.delete(host.fingerprint))
    }
  }
}
