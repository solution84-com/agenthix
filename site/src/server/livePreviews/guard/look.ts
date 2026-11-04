/**
 * One look at one live preview (live preview spec section 6, *The guard*): its containers against their templates,
 * the host service's protections for live previews holding, what runs and listens in its container and with what
 * privileges, the drops the protections counted for its addresses, and its use. Whatever it finds goes to the
 * responder; a look that cannot be taken counts as a failure, and the guard stops a live preview it cannot look at.
 */
import type { GuardSignal, ProtectionDrop } from '@agenthix/core'
import type { LivePreviewTemplate } from '../container/template'
import { templateDifferences } from '../container/inspect'
import type { GuardDocker, InspectedContainer } from './guardDocker'
import { privilegedProcesses, readSnapshot, snapshotArgv, treeOf, unexpectedProcesses } from './processes'
import { BlockedWindow, UsagePattern } from './rates'
import type { GuardTarget, SignalFacts } from './respond'
import { maskPreviewText } from '../secrets/previewMasks'

/** What the guard asks about a live preview that only the rest of the site knows. */
export type PreviewActivity = {
  /** The top processes of its apps and the relays carrying their streams; everything under each is spared. */
  spared(id: string): ReadonlySet<number>
  /** Ports its apps listen on. */
  registeredPorts(id: string): ReadonlySet<number>
  /** A command of the site's own is going in it now (an install, a service's start). */
  siteExecGoing(id: string): boolean
  /** Its apps are starting, or a run works on its branch: use above the pattern is expected then. */
  busy(id: string): boolean
}

/** Its services' containers, checked beside its own. */
export type ServiceChecks = {
  /** What about `c` differs from its service's template; null when it is no service the site made. */
  differences(id: string, c: InspectedContainer): string[] | null
  healthCheck(id: string, containerName: string, command: string): boolean
}

export type LookDeps = {
  docker: GuardDocker
  template(id: string): LivePreviewTemplate | null
  helper(id: string, argv: string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string }>
  activity: PreviewActivity
  services?: ServiceChecks
  drops(): Promise<ProtectionDrop[] | null>
  /** Null when the host service's protections for live previews hold now; otherwise what is wrong. */
  protectionsProblem(): Promise<string | null>
  now(): number
}

export type WatchedPreview = GuardTarget & { paused: boolean }
export type Finding = { signal: GuardSignal; facts: SignalFacts } | { outOfMemory: GuardTarget }

export const LOOK_FAILURES_ALLOWED = 2
export const SNAPSHOT_TIMEOUT_MS = 3_000

export class PreviewWatch {
  failures = 0
  private seen = new Set<number>()
  private runningWhilePaused = 0
  private readonly blocked = new BlockedWindow()
  private readonly usage = new UsagePattern()

  constructor(public lp: WatchedPreview) {}

  async look(deps: LookDeps): Promise<Finding[]> {
    const { lp } = this
    const target: GuardTarget = { id: lp.id, projectId: lp.projectId }
    const found = (signal: GuardSignal, what?: string, extra: Omit<SignalFacts, 'lp' | 'what'> = {}): Finding[] =>
      [{ signal, facts: { lp: target, what, ...extra } }]
    const template = deps.template(lp.id)
    if (!template) return found('guardDown', 'the site no longer knows how it made its container')
    const containers = await deps.docker.inspect(await deps.docker.containerIds(lp.id))
    const own = containers.find(c => c.name === template.name)
    if (!own) return found('guardDown', 'its container is gone')
    if (!own.running && own.oomKilled) return [{ outOfMemory: target }]
    for (const c of containers) {
      if (c.name !== template.name) {
        const differences = deps.services?.differences(lp.id, c) ?? null
        if (differences === null) return found('notMadeBySite', `a container ${c.name}`)
        if (differences.length) return found('offTemplate', `${c.name}: ${differences.join('; ')}`)
        continue
      }
      const differences = templateDifferences(template, c.raw, template.image)
      if (differences.length) return found('offTemplate', differences.join('; '))
    }
    if (lp.paused) {
      this.runningWhilePaused = containers.some(c => c.running && !c.paused) ? this.runningWhilePaused + 1 : 0
      return this.runningWhilePaused >= 2 ? found('notMadeBySite', 'its container was let run while it was paused') : []
    }
    this.runningWhilePaused = 0
    const unprotected = await deps.protectionsProblem().catch(() => 'they could not be checked')
    if (unprotected) return found('protectionsDown', unprotected)

    const out: Finding[] = []
    const snapshot = readSnapshot((await deps.helper(lp.id, snapshotArgv(), SNAPSHOT_TIMEOUT_MS)).stdout)
    if (!snapshot) throw new Error('the look inside the live preview did not answer')
    const privileged = privilegedProcesses(snapshot, template.user)
    if (privileged.length) {
      // A command line can carry a secret an earlier hand-off gave the app: masked before it reaches the log or hq.
      out.push(...found('privilegeChange', await maskPreviewText(lp.id, privileged.map(p => `${p.process.command || `process ${p.process.pid}`} ${p.why}`).join(', ')).then(t => t.slice(0, 200))))
    }
    const roots = unexpectedProcesses(snapshot, { spared: deps.activity.spared(lp.id), siteExecGoing: deps.activity.siteExecGoing(lp.id) })
    // A process taken in by PID 1 is acted on at its first look; an exec tree only on its second, since one look can
    // catch a command of the site's own in its last moment.
    const lasting = roots.filter(p => p.ppid === 1 || this.seen.has(p.pid))
    this.seen = new Set(roots.map(p => p.pid))
    if (lasting.length) {
      const pids = [...new Set(lasting.flatMap(p => treeOf(snapshot, p.pid)))]
      out.push(...found('unexpectedProcess', (await maskPreviewText(lp.id, lasting.map(p => p.command || `process ${p.pid}`).join(', '))).slice(0, 200), { pids }))
    }
    const registered = deps.activity.registeredPorts(lp.id)
    const ports = snapshot.listening.open.filter(p => !registered.has(p))
    if (ports.length) out.push(...found('unexpectedPort', `port ${ports.join(', ')}`))

    const now = deps.now()
    const drops = await deps.drops()
    if (drops && this.blocked.add(drops, containers.flatMap(c => c.addresses), now)) out.push(...found('blockedAddresses'))
    const verdict = this.usage.add(await deps.docker.usage(containers.map(c => c.id)), now, deps.activity.busy(lp.id))
    if (verdict.unusual) out.push(...found('unusualUse', verdict.what))
    return out
  }
}
