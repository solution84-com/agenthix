/**
 * Install scripts in a live preview (live preview spec section 4, *The app*; blocked by default on the organisation's
 * sites): packages install with their scripts off, and only the
 * scripts of packages that pass one fixed rule then run, through the sandbox launcher. No model and no person decides
 * package by package; a package that fails is blocked, the agent looks for another, and only then is the person asked,
 * whose yes in HQ lets that named package's script run (`package.use`).
 *
 * The rule, on facts the public registries publish: published at least `INSTALL_RULE.minAgeDays` ago, more than
 * `INSTALL_RULE.minWeeklyDownloads` downloads a week, no known advisory (the OSV database), and its version came from
 * the publisher of the version before. A short built-in list, and an organisation's own trusted scopes, skip it.
 * Facts are looked up once per package version and kept. With no registry, the rule cannot run: scripts stay off.
 */

/** The package managers whose scripts can be switched off; all three install from the npm registry. */
export const SCRIPT_PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn'] as const
export type ScriptPackageManager = (typeof SCRIPT_PACKAGE_MANAGERS)[number]
export const PACKAGE_ECOSYSTEMS = ['npm'] as const
export type PackageEcosystem = (typeof PACKAGE_ECOSYSTEMS)[number]

export const INSTALL_RULE = { minAgeDays: 30, minWeeklyDownloads: 1000 } as const

/** Well-known packages whose scripts their users need, allowed without the lookups. By name, whatever the version. */
export const BUILT_IN_SCRIPT_PACKAGES: readonly string[] = [
  'esbuild', 'sharp', 'bcrypt', 'better-sqlite3', 'sqlite3', 'canvas', 'node-gyp', 'node-sass', 'puppeteer', 'playwright',
  'electron', '@swc/core', 'core-js', 'protobufjs', 'msw', 'husky', 'prisma', '@prisma/client', '@prisma/engines',
  'cypress', 'fsevents', 'bufferutil', 'utf-8-validate', 'argon2', 'deasync', 'nodemon', 'lefthook', 'unrs-resolver',
]

/** What the registries say about one package version. A fact the lookup could not get is null. */
export type PackageFacts = {
  ecosystem: PackageEcosystem
  name: string
  version: string
  /** When this version was published, ISO. */
  publishedAt: string | null
  weeklyDownloads: number | null
  /** The OSV advisories that affect this version, by id. */
  advisories: string[] | null
  publisher: string | null
  /** The publisher of the version before; undefined when this is the first version. */
  previousPublisher: string | null | undefined
}

/**
 * Why a package failed the rule: `tooNew`, `fewDownloads`, `advisories`, `publisherChanged`, or `unknown` (a fact
 * the registries did not give, which fails rather than passes).
 */
export const INSTALL_SCRIPT_REASONS = ['tooNew', 'fewDownloads', 'advisories', 'publisherChanged', 'unknown'] as const
export type InstallScriptReason = (typeof INSTALL_SCRIPT_REASONS)[number]

export type InstallScriptVerdict =
  | { allowed: true; why: 'builtIn' | 'trustedScope' | 'rule' }
  | { allowed: false; reasons: InstallScriptReason[] }
  /** The registry could not be reached: the rule cannot run, so scripts stay off. */
  | { allowed: false; registryUnreachable: true }

/** An npm scope an organisation's admins trust, such as `@fernhill`. */
export function isPackageScope(value: unknown): value is string {
  return typeof value === 'string' && /^@[a-z0-9][a-z0-9._-]{0,213}$/.test(value)
}

/** The most scopes an organisation may trust: a short list of its own, never a way around the rule. */
export const MAX_TRUSTED_PACKAGE_SCOPES = 20

/** The organisation's trusted scopes as they travel: distinct scopes, at most `MAX_TRUSTED_PACKAGE_SCOPES`; null otherwise. */
export function readPackageScopes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_TRUSTED_PACKAGE_SCOPES || !value.every(isPackageScope)) return null
  return new Set(value).size === value.length ? [...value] : null
}

/** A package name as npm takes it: lower case, at most 214 characters, optionally in a scope. */
export function isNpmPackageName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 214
    && /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
}

const DAY_MS = 86_400_000

/**
 * The rule applied to a package. `facts` null: the registry could not be reached. `trustedScopes` are the
 * organisation's; a scope must be the name's own (`@fernhill/x`), never a prefix of another scope.
 */
export function judgeInstallScript(
  name: string, facts: PackageFacts | null, opts: { now: number; trustedScopes: readonly string[] },
): InstallScriptVerdict {
  if (BUILT_IN_SCRIPT_PACKAGES.includes(name)) return { allowed: true, why: 'builtIn' }
  const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : null
  if (scope && opts.trustedScopes.includes(scope)) return { allowed: true, why: 'trustedScope' }
  if (!facts) return { allowed: false, registryUnreachable: true }
  const reasons = new Set<InstallScriptReason>()
  const published = facts.publishedAt === null ? NaN : Date.parse(facts.publishedAt)
  if (Number.isNaN(published)) reasons.add('unknown')
  else if (opts.now - published < INSTALL_RULE.minAgeDays * DAY_MS) reasons.add('tooNew')
  if (facts.weeklyDownloads === null) reasons.add('unknown')
  else if (!(facts.weeklyDownloads > INSTALL_RULE.minWeeklyDownloads)) reasons.add('fewDownloads')
  if (facts.advisories === null) reasons.add('unknown')
  else if (facts.advisories.length > 0) reasons.add('advisories')
  if (facts.previousPublisher !== undefined) {
    if (facts.publisher === null || facts.previousPublisher === null) reasons.add('unknown')
    else if (facts.publisher !== facts.previousPublisher) reasons.add('publisherChanged')
  }
  return reasons.size ? { allowed: false, reasons: INSTALL_SCRIPT_REASONS.filter(r => reasons.has(r)) } : { allowed: true, why: 'rule' }
}

/** The key a package version's facts are kept under: each is looked up once. */
export function packageFactsKey(ecosystem: PackageEcosystem, name: string, version: string): string {
  return `${ecosystem}:${name}@${version}`
}

/**
 * The step a passing package shows. Only a package that passed the rule's lookups is said to have no known issues: a
 * built-in one is never looked up, so its step says only that it is on the list.
 */
export function installScriptAllowedStep(name: string, why: 'builtIn' | 'trustedScope' | 'rule'): string {
  const because = {
    builtIn: 'it is on the built-in list of well-known packages that need their scripts',
    trustedScope: 'your organisation trusts its scope',
    rule: 'widely used, no known issues',
  }[why]
  return `Allowed ${name}'s install script (${because}).`
}

/**
 * The person's question for a blocked package, in plain risk terms with a recommendation: *This package is 2 days old,
 * has 40 downloads a week and runs code when installed. I recommend not using it.*
 */
export function installScriptQuestion(facts: PackageFacts | null, verdict: InstallScriptVerdict, now: number): string {
  if (verdict.allowed) return ''
  if ('registryUnreachable' in verdict || !facts) {
    return `${facts?.name ?? 'This package'} runs code when installed, and its registry could not be reached to check it, so its install script was not run.`
  }
  const said: string[] = []
  for (const reason of verdict.reasons) {
    if (reason === 'tooNew' && facts.publishedAt) {
      const days = Math.max(0, Math.floor((now - Date.parse(facts.publishedAt)) / DAY_MS))
      said.push(`is ${days} day${days === 1 ? '' : 's'} old`)
    } else if (reason === 'fewDownloads' && facts.weeklyDownloads !== null) {
      said.push(`has ${facts.weeklyDownloads.toLocaleString('en')} download${facts.weeklyDownloads === 1 ? '' : 's'} a week`)
    } else if (reason === 'advisories' && facts.advisories) {
      said.push(`has ${facts.advisories.length} known security advisor${facts.advisories.length === 1 ? 'y' : 'ies'}`)
    } else if (reason === 'publisherChanged') said.push('was published by someone other than its previous version')
    else if (reason === 'unknown') said.push('could not be fully checked')
  }
  return `${facts.name} ${said.join(', ')} and runs code when installed. I recommend not using it.`
}
