/**
 * How packages are installed in a live preview with their install scripts off (live preview spec section 4; adr-0170), and how one
 * package's scripts are then run once it passes. Pure: argument lists and environments only.
 *
 * Scripts are switched off by the environment, which outranks every configuration file a repository can carry
 * (`.npmrc`, `.yarnrc`, `.yarnrc.yml`, `pnpm-workspace.yaml`): npm and pnpm read `npm_config_ignore_scripts`, Yarn 1
 * `YARN_IGNORE_SCRIPTS`, and later Yarns `YARN_ENABLE_SCRIPTS`. The same environment is every live-preview command's, so an
 * install the agent runs itself keeps scripts off too.
 */
import { SCRIPT_PACKAGE_MANAGERS, isNpmPackageName, type ScriptPackageManager } from '@agenthix/core'

export const INSTALL_ENV: Readonly<Record<string, string>> = {
  npm_config_ignore_scripts: 'true',
  YARN_IGNORE_SCRIPTS: 'true',
  YARN_ENABLE_SCRIPTS: 'false',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
}

export const MAX_PACKAGES_PER_INSTALL = 50

/** A version or range after `name@`: digits, letters and the range operators, never a URL, path, tag-with-slash or alias. */
const VERSION_RANGE = /^[A-Za-z0-9^~<>=*][A-Za-z0-9.^~<>=*|+ -]{0,63}$/

export class InstallInputProblem extends Error {}

export function isScriptPackageManager(value: unknown): value is ScriptPackageManager {
  return typeof value === 'string' && (SCRIPT_PACKAGE_MANAGERS as readonly string[]).includes(value)
}

/**
 * A package the agent asked to add, as `name` or `name@range` from the public registry. A git, file, URL or `npm:`
 * alias is refused: those fetch from somewhere the rule's facts do not describe.
 */
export function readPackageSpec(spec: string): string {
  const trimmed = spec.trim()
  const at = trimmed.indexOf('@', trimmed.startsWith('@') ? 1 : 0)
  const name = at === -1 ? trimmed : trimmed.slice(0, at)
  const range = at === -1 ? null : trimmed.slice(at + 1)
  if (!isNpmPackageName(name)) {
    throw new InstallInputProblem(`"${spec}" is not a package name. Give a name from the npm registry, such as "zod" or "@types/node", optionally with @ and a version.`)
  }
  if (range !== null && (!VERSION_RANGE.test(range) || range.trim() !== range)) {
    throw new InstallInputProblem(`"${spec}" is not a version from the npm registry. Give a version or range after @, such as "zod@3" or "zod@^3.23.0"; git, file and URL sources are not installed here.`)
  }
  return range === null ? name : `${name}@${range}`
}

/** The install, with scripts off whatever the project says. `packages` empty: install what package.json lists. */
export function installArgv(manager: ScriptPackageManager, packages: readonly string[], dev: boolean): string[] {
  if (packages.length > MAX_PACKAGES_PER_INSTALL) throw new InstallInputProblem(`Add at most ${MAX_PACKAGES_PER_INSTALL} packages at once.`)
  const specs = packages.map(readPackageSpec)
  if (manager === 'npm') return ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', ...(dev ? ['--save-dev'] : []), ...specs]
  if (manager === 'pnpm') {
    return specs.length
      ? ['corepack', 'pnpm', 'add', '--ignore-scripts', ...(dev ? ['--save-dev'] : []), ...specs]
      : ['corepack', 'pnpm', 'install', '--ignore-scripts']
  }
  // Yarn's own flag differs between its versions; the environment switches scripts off for each.
  return specs.length ? ['yarn', 'add', ...(dev ? ['--dev'] : []), ...specs] : ['yarn', 'install']
}

/**
 * Runs one installed package's install scripts (preinstall, install, postinstall, or a native build), by its folder
 * relative to the project. npm does this for any layout that has a `node_modules` folder, npm's, pnpm's or Yarn's.
 * Always given a folder: `npm rebuild` with none would run every package's scripts and the project's own.
 */
export function rebuildArgv(dir: string): string[] {
  if (!isPackageDir(dir)) throw new Error(`Refusing to run scripts for ${JSON.stringify(dir)}`)
  return ['npm', 'rebuild', '--no-audit', '--no-fund', `./${dir}`]
}

/** The environment for that run: scripts on, for the one package named. */
export const REBUILD_ENV: Readonly<Record<string, string>> = { ...INSTALL_ENV, npm_config_ignore_scripts: 'false' }

const DIR_SEGMENT = /^[A-Za-z0-9@._+()][A-Za-z0-9@._+()-]{0,213}$/

/** A package's folder as the scan reports it: relative, inside a `node_modules`, no `..`, nothing a shell or npm reads as more. */
export function isPackageDir(dir: unknown): dir is string {
  if (typeof dir !== 'string' || dir.length === 0 || dir.length > 1024) return false
  const parts = dir.split('/')
  if (parts.length < 2 || parts[0] !== 'node_modules') return false
  return parts.every(p => DIR_SEGMENT.test(p) && p !== '.' && p !== '..')
}
