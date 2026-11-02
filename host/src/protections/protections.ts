/**
 * The agent protections, applied and kept (host-management spec §8): at start, and checked every minute — put
 * back when anything removed them. Their state is what the figures report, so the site, which starts no agent
 * until they hold, and `agenthix status` both read it from here.
 *
 * Everything that cannot be confirmed counts as not holding: no firewall tool, no right to change the firewall,
 * a container that does not share the machine's network, or — on Docker Desktop — not knowing the address of the
 * computer Docker runs on.
 */
import type { ProtectionFigures, ProtectionRule } from '@agenthix/core'
import type { RunResult } from '../docker/docker'
import { Firewall, nftCli } from './firewall'
import { nftScript, rulesFor, rulesInPlace, tableFor, type RuleSet } from './rules'
import { dropsIn } from './drops'

export const CHECK_INTERVAL_MS = 60_000

/**
 * The rules for this machine, or why they cannot be built; null while the installation has no agent slice (no site
 * here), when there are no agents to keep out and no rules are written.
 */
export type RuleSource = () => Promise<RuleSet | { problem: string } | null>

/** No site here, so no agents: nothing to keep out, and nothing written to the firewall. */
const NO_AGENTS: Omit<ProtectionFigures, 'checkedAt'> = { holding: true, rules: [], problem: null }

const NOT_YET: Omit<ProtectionFigures, 'checkedAt'> = {
  holding: false,
  rules: [],
  problem: 'The host service has not applied the agent protections yet.',
}

function applyProblem(r: RunResult): string {
  const said = (r.stderr || r.stdout).trim()
  if (r.code === 127) return "The host service's image has no firewall tool, so the rules that keep agents out of this machine cannot be applied."
  if (/not permitted|permission denied/i.test(said)) {
    return "The host service may not change this machine's firewall. Start its container with --cap-add NET_ADMIN, as the guide's command does."
  }
  const last = said.split('\n').filter(Boolean).pop()
  return `The rules that keep agents out of this machine could not be applied${last ? `: ${last.slice(0, 200)}` : '.'}`
}

/** Once the table is removed for an uninstall, nothing puts it back. */
const REMOVED: Omit<ProtectionFigures, 'checkedAt'> = {
  holding: false,
  rules: [],
  problem: 'The agent protections were removed: this machine is being uninstalled.',
}

/** How removing the table went: `absent` when there was none, so a second uninstall finds nothing to fail on. */
export type TableRemoval = 'removed' | 'absent'

/** Whether the table is in the machine's firewall: false when nft says there is none, or cannot say. */
export async function tablePresent(firewall: Firewall, table: string): Promise<boolean> {
  return (await firewall.list(table)).code === 0
}

/** Deletes the install's table; why not, in words, when nft refuses. */
export async function removeTable(firewall: Firewall, table: string): Promise<TableRemoval> {
  const listed = await firewall.list(table)
  if (listed.code !== 0 && /no such file|does not exist/i.test(listed.stderr)) return 'absent'
  const deleted = await firewall.delete(table)
  if (deleted.code === 0) return 'removed'
  if (/no such file|does not exist/i.test(deleted.stderr)) return 'absent'
  throw new Error(removeProblem(deleted, table))
}

function removeProblem(r: RunResult, table: string): string {
  const said = (r.stderr || r.stdout).trim()
  if (r.code === 127) return `The host service's image has no firewall tool, so the firewall table ${table} could not be removed.`
  if (/not permitted|permission denied/i.test(said)) return `The host service may not change this machine's firewall, so the firewall table ${table} could not be removed.`
  const last = said.split('\n').filter(Boolean).pop()
  return `The firewall table ${table} could not be removed${last ? `: ${last.slice(0, 200)}` : '.'}`
}

export class AgentProtections {
  private last: ProtectionFigures | null = null
  private running: Promise<ProtectionFigures> | null = null
  /** Moves on when the agents' range changes, so a check begun before it cannot leave its result behind. */
  private generation = 0
  private runningGeneration = 0
  private removed = false

  constructor(
    private readonly firewall: Firewall,
    private readonly rules: RuleSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The last check's result; until the first check, that they do not hold. */
  figures(): ProtectionFigures {
    return this.last ?? { ...NOT_YET, checkedAt: this.now().toISOString() }
  }

  /** Checks the rules, applies them whole when any is missing, and checks again. One at a time. */
  check(): Promise<ProtectionFigures> {
    if (!this.running || this.runningGeneration !== this.generation) {
      const generation = this.generation
      const running: Promise<ProtectionFigures> = this.checkOnce().then(f => {
        if (generation === this.generation) this.last = f
        return f
      }).finally(() => { if (this.running === running) this.running = null })
      this.running = running
      this.runningGeneration = generation
    }
    return this.running
  }

  /**
   * The installation was given its agents' range: what the last check found no longer says anything, so until the
   * rules for the range are in place the protections do not hold. Checked again at once.
   */
  rangeChanged(): void {
    this.generation++
    this.last = null
    void this.check()
  }

  private async inPlace(set: RuleSet): Promise<ProtectionRule[]> {
    const listed = await this.firewall.list(set.table)
    return listed.code === 0 ? rulesInPlace(listed.stdout, set) : []
  }

  hasTable(table: string): Promise<boolean> {
    return tablePresent(this.firewall, table)
  }

  /** Stops keeping the rules — after any check under way — and deletes their table: an uninstall's step. */
  async remove(table: string): Promise<TableRemoval> {
    this.removed = true
    await this.running?.catch(() => {})
    return removeTable(this.firewall, table)
  }

  private async checkOnce(): Promise<ProtectionFigures> {
    const checkedAt = () => this.now().toISOString()
    if (this.removed) return { ...REMOVED, checkedAt: checkedAt() }
    const set = await this.rules().catch((err: unknown) => ({ problem: err instanceof Error ? err.message : String(err) }))
    if (set === null) return { ...NO_AGENTS, checkedAt: checkedAt() }
    if ('problem' in set) return { holding: false, rules: [], checkedAt: checkedAt(), problem: set.problem }

    const wanted = rulesFor(set)
    let rules = await this.inPlace(set)
    if (!wanted.every(r => rules.includes(r))) {
      const applied = await this.firewall.apply(nftScript(set))
      if (applied.code !== 0) return { holding: false, rules: await this.inPlace(set), checkedAt: checkedAt(), problem: applyProblem(applied) }
      rules = await this.inPlace(set)
    }
    const holding = wanted.every(r => rules.includes(r))
    const listed = set.livePreview ? await this.firewall.list(set.table) : null
    return {
      holding,
      rules: wanted.filter(r => rules.includes(r)),
      checkedAt: checkedAt(),
      problem: holding ? null : 'The rules that keep agents out of this machine were applied, but do not hold.',
      ...(listed && listed.code === 0 ? { drops: dropsIn(listed.stdout, set) } : {}),
      ...(set.livePreview ? { publicAddressKnown: set.livePreview.publicAddresses.length > 0 } : {}),
    }
  }

  /** At once, then every minute. Returns the stop function. */
  start(intervalMs = CHECK_INTERVAL_MS, log: (line: string) => void = () => {}): () => void {
    let was: boolean | null = null
    const run = () => {
      void this.check().then(f => {
        if (f.holding !== was) log(f.holding ? 'Agent protections hold.' : `Agent protections do not hold: ${f.problem}`)
        was = f.holding
      })
    }
    run()
    const timer = setInterval(run, intervalMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }
}

let current: AgentProtections | null = null

/** The service's own protections, set once at start (main.ts); the figures read them from here. */
export function useProtections(p: AgentProtections): void {
  current = p
}

/** Called once the installation records its agents' range (`compose/agentSlice.ts`). */
export function agentRangeRecorded(): void {
  current?.rangeChanged()
}

/** A new public address the machine is seen from was recorded: the rules are checked, and written, at once. */
export function publicAddressRecorded(): void {
  void current?.check()
}

export function protectionFigures(now: Date): ProtectionFigures {
  return current?.figures() ?? { ...NOT_YET, checkedAt: now.toISOString() }
}

/**
 * The uninstall's step: the service's own protections stop being kept and their table goes; with none running (a
 * process that is not the service), the table is deleted all the same.
 */
export function removeProtections(namespace: string, firewall: Firewall = new Firewall(nftCli)): Promise<TableRemoval> {
  const table = tableFor(namespace)
  return current ? current.remove(table) : removeTable(firewall, table)
}

export function protectionsTablePresent(table: string, firewall: Firewall = new Firewall(nftCli)): Promise<boolean> {
  return current ? current.hasTable(table) : tablePresent(firewall, table)
}
