/**
 * An install in a live preview (adr-0170): the packages installed with their scripts off, then the scripts of those
 * that pass the rule run, each through the sandbox launcher in the live preview's container, which shares the copy
 * with the agent. No model and no person decides package by package; a package a person allowed after the agent asked
 * them (`package.use`) runs too.
 */
import path from 'node:path'
import {
  BUILT_IN_SCRIPT_PACKAGES, installScriptAllowedStep, installScriptQuestion, judgeInstallScript,
  type InstallScriptVerdict, type PackageFacts, type ScriptPackageManager,
} from '@agenthix/core'
import { InstallInputProblem, INSTALL_ENV, REBUILD_ENV, installArgv, rebuildArgv } from './installCommand'
import { packageIdentity, registryCopyIdentity } from './packageIdentity'
import { SCAN_SCRIPT, SCAN_TIMEOUT_MS, readScan, type ScannedPackage } from './scanScript'
import { personAllowed, recordBlocked, type BlockedPackage } from './packages'

export type ExecCall = { cwd: string; env: Record<string, string>; timeoutMs: number }
export type ExecAnswer = { exitCode: number; stdout: string; stderr: string }
/**
 * The place an install runs in: its id (a live preview's, or `copyKey`), where its copy is in its container, and the
 * branch's key (`branchKey`), whose yeses count here too.
 */
export type InstallTarget = { id: string; root: string; branchKey?: string }

export const INSTALL_TIMEOUT_MS = 10 * 60 * 1000
export const SCRIPT_TIMEOUT_MS = 10 * 60 * 1000
const OUTPUT_LINES = 30

export type InstallInput = { folder: string; manager: ScriptPackageManager; packages: string[]; dev: boolean }

export type InstallDeps = {
  exec: (lp: InstallTarget, argv: string[], opts: ExecCall) => Promise<ExecAnswer>
  facts: (name: string, version: string) => Promise<PackageFacts | null>
  trustedScopes: () => Promise<readonly string[]>
  now: () => number
}

type Why = 'builtIn' | 'trustedScope' | 'rule' | 'person'
export type ScriptRun = { name: string; version: string; dir: string; why: Why; ok: boolean; output: string }

export type InstallReport =
  | { installed: false; manager: ScriptPackageManager; output: string }
  | {
    installed: true
    manager: ScriptPackageManager
    ran: ScriptRun[]
    blocked: BlockedPackage[]
    /** Yarn's Plug'n'Play: no `node_modules`, so no install script is run here. */
    pnp: boolean
    /** The walk stopped before the end, or could not be read: scripts it did not reach did not run. */
    incomplete: boolean
  }

export const lastLines = (text: string, n = OUTPUT_LINES) => text.trimEnd().split('\n').slice(-n).join('\n')

/** The project folder in the live preview's container, from the agent's folder relative to its working folder. */
export function projectDir(root: string, folder: string): string {
  const rel = folder.trim() === '' ? '.' : folder.trim()
  if (path.posix.isAbsolute(rel) || rel.includes('\0')) throw new InstallInputProblem('Give the folder relative to your working folder, such as "." or "web".')
  const dir = path.posix.join(root, rel).replace(/(.)\/+$/, '$1')
  if (dir !== root && !dir.startsWith(`${root}/`)) throw new InstallInputProblem('The folder must be inside your working folder.')
  return dir
}

type Judged = { pkg: ScannedPackage; name: string; version: string; allowedWhy: Why | null; blocked: BlockedPackage | null }

async function judge(lp: InstallTarget, pkgs: ScannedPackage[], deps: InstallDeps): Promise<Judged[]> {
  const scopes = await deps.trustedScopes()
  const lookups = new Map<string, Promise<PackageFacts | null>>()
  const judged: Judged[] = []
  for (const pkg of pkgs) {
    const folderScope = pkg.folder.startsWith('@') ? pkg.folder.slice(0, pkg.folder.indexOf('/')) : null
    // A trusted scope's packages come from the registry the project names for it, so which registry is not checked;
    // that it came from one, as a version, is.
    const scoped = folderScope !== null && scopes.includes(folderScope) ? registryCopyIdentity(pkg) : null
    const id = scoped && 'identity' in scoped ? scoped : packageIdentity(pkg)
    const trusted = id === scoped
    const name = 'identity' in id ? id.identity.name : pkg.folder
    const version = 'identity' in id ? id.identity.version : (pkg.version ?? 'unknown')
    const scope = trusted ? folderScope : null
    if (personAllowed(lp.id, name, version) || (lp.branchKey !== undefined && personAllowed(lp.branchKey, name, version))) {
      judged.push({ pkg, name, version, allowedWhy: 'person', blocked: null })
      continue
    }
    if ('unchecked' in id) {
      const verdict: InstallScriptVerdict = { allowed: false, reasons: ['unknown'] }
      const facts: PackageFacts = { ecosystem: 'npm', name, version, publishedAt: null, weeklyDownloads: null, advisories: null, publisher: null, previousPublisher: null }
      judged.push({ pkg, name, version, allowedWhy: null, blocked: { name, version, verdict, facts, question: installScriptQuestion(facts, verdict, deps.now()) } })
      continue
    }
    const skipsLookups = trusted || BUILT_IN_SCRIPT_PACKAGES.includes(name)
    let facts: PackageFacts | null = null
    if (!skipsLookups) {
      const key = `${name}@${version}`
      if (!lookups.has(key)) lookups.set(key, deps.facts(name, version))
      facts = await lookups.get(key)!
    }
    const verdict = judgeInstallScript(name, facts, { now: deps.now(), trustedScopes: trusted ? [scope!] : [] })
    judged.push(verdict.allowed
      ? { pkg, name, version, allowedWhy: verdict.why, blocked: null }
      : { pkg, name, version, allowedWhy: null, blocked: { name, version, verdict, facts, question: installScriptQuestion(facts, verdict, deps.now()) } })
  }
  return judged
}

export async function installInPreview(lp: InstallTarget, input: InstallInput, deps: InstallDeps): Promise<InstallReport> {
  const cwd = projectDir(lp.root, input.folder)
  const argv = installArgv(input.manager, input.packages, input.dev)
  const install = await deps.exec(lp, argv, { cwd, env: { ...INSTALL_ENV }, timeoutMs: INSTALL_TIMEOUT_MS })
  if (install.exitCode !== 0) return { installed: false, manager: input.manager, output: lastLines(`${install.stdout}\n${install.stderr}`) }

  const scan = await deps.exec(lp, ['node', '-e', SCAN_SCRIPT, cwd], { cwd, env: { ...INSTALL_ENV }, timeoutMs: SCAN_TIMEOUT_MS })
  const found = scan.exitCode === 0 ? readScan(scan.stdout) : null
  const judged = await judge(lp, found?.packages ?? [], deps)

  const blocked = new Map<string, BlockedPackage>()
  for (const j of judged) {
    if (j.blocked) {
      blocked.set(`${j.name}@${j.version}`, j.blocked)
      recordBlocked(lp.id, j.blocked)
    }
  }
  // Deeper copies first: a package nested in another's folder is usually what that one builds on.
  const toRun = judged.filter(j => j.allowedWhy !== null).sort((a, b) => b.pkg.dir.split('/').length - a.pkg.dir.split('/').length)
  const ran: ScriptRun[] = []
  for (const j of toRun) {
    const res = await deps.exec(lp, rebuildArgv(j.pkg.dir), { cwd, env: { ...REBUILD_ENV }, timeoutMs: SCRIPT_TIMEOUT_MS })
    ran.push({ name: j.name, version: j.version, dir: j.pkg.dir, why: j.allowedWhy!, ok: res.exitCode === 0, output: res.exitCode === 0 ? '' : lastLines(`${res.stdout}\n${res.stderr}`) })
  }
  return { installed: true, manager: input.manager, ran, blocked: [...blocked.values()], pnp: found?.pnp ?? false, incomplete: !found || found.truncated }
}

/** What the agent reads: each step in plain words, and what to do about a blocked package. */
export function installReportText(report: InstallReport): string {
  if (!report.installed) {
    return `The install failed (${report.manager}). Nothing else was run. Its last output:\n${report.output}`
  }
  const lines = [`Installed with ${report.manager}, with install scripts off.`]
  for (const r of report.ran) {
    const step = r.why === 'person' ? `Ran ${r.name}'s install script (the person allowed it).` : installScriptAllowedStep(r.name, r.why)
    lines.push(r.ok ? step : `${step} It failed:\n${r.output}`)
  }
  if (report.pnp) lines.push("This project uses Yarn Plug'n'Play, which has no node_modules folder, so no package's install script was run.")
  if (report.incomplete) lines.push('Not every installed package could be checked, so the install scripts of those not checked did not run.')
  if (report.blocked.length) {
    const unreachable = report.blocked.some(b => !b.verdict.allowed && 'registryUnreachable' in b.verdict)
    lines.push('', 'Blocked (installed, but its install script did not run):')
    for (const b of report.blocked) lines.push(`- ${b.name}@${b.version}: ${b.question}`)
    lines.push('', unreachable
      ? 'The npm registry could not be reached to check some packages, so their install scripts stay off. Tell the person why.'
      : 'Look for another package that does the same job and is widely used, and install that instead.')
    lines.push('If there is no other package, call ask_to_use_package with the blocked name and version: the person decides. Do not run its install script yourself.')
  }
  lines.push('', "The project's own install scripts (in its package.json) did not run. Run one with npm run <name> if the project needs it.")
  return lines.join('\n')
}
