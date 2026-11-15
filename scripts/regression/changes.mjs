// What a change since the base reaches that the module map (scripts/affected.mjs) does not say: whether the migration
// check and the upgrade test have something to prove. Both prove what an installation carries forward, so both are
// judged by what an installation runs, not by which modules changed.
//
// The migration check runs when a migration changed. The upgrade test runs only when what it proves changed: a
// migration, the host service's upgrade (host/src/upgrades/), or an image an installation runs (hq's and the site's
// content keys, and the Postgres image the host service names), or when it is asked for (the monthly dependency
// updates ask). The working tree is compared, uncommitted and untracked files included, as the image keys are.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeKeys } from '../images/keys.mjs'

export const MIGRATION_PATHS = ['hq/migrations/', 'site/migrations/']
export const UPGRADE_PATHS = [...MIGRATION_PATHS, 'host/src/upgrades/']
/** The images whose content the upgrade test installs and upgrades: hq's and the site's. */
export const UPGRADED_PARTS = ['hq-server', 'hq-web', 'site-server']
const POSTGRES_FILE = 'host/src/images/published.ts'

/** The Postgres image a version of published.ts names, or null. */
export function postgresImage(source) {
  return /^export const POSTGRES_IMAGE = '(.*)'$/m.exec(source ?? '')?.[1] ?? null
}

/**
 * { migrations, upgrade }: whether a migration changed, and why the upgrade test runs (null when it does not).
 * `paths` changed since the base; `keysBase` and `keysNow` are the image parts' content keys there and now; `postgres`
 * the image named there and now; `asked` forces the upgrade test; `unknown` (no base to compare with) runs both.
 */
export function judgeChanges({ paths = [], keysBase = {}, keysNow = {}, postgres = {}, asked = false, unknown = null }) {
  const under = (prefixes) => paths.filter((p) => prefixes.some((prefix) => p.startsWith(prefix)))
  if (unknown) return { migrations: true, upgrade: asked ? 'it was asked for (--upgrade-test)' : unknown }
  const migrations = under(MIGRATION_PATHS).length > 0
  const reasons = []
  if (asked) reasons.push('it was asked for (--upgrade-test)')
  const upgradePaths = under(UPGRADE_PATHS)
  if (upgradePaths.length) reasons.push(`${upgradePaths[0]}${upgradePaths.length > 1 ? ` and ${upgradePaths.length - 1} more` : ''} changed`)
  const parts = UPGRADED_PARTS.filter((part) => keysBase[part] !== keysNow[part])
  if (parts.length) reasons.push(`the ${parts.join(', ')} image${parts.length > 1 ? 's' : ''} changed`)
  if (postgres.base !== postgres.now) reasons.push('the Postgres image changed')
  return { migrations, upgrade: reasons.length ? reasons.join('; ') : null }
}

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })

/** The changes from `base` to the working tree, read from Git, judged by judgeChanges. */
export function readChanges({ root, base, asked = false }) {
  try {
    git(root, ['cat-file', '-e', `${base}^{commit}`])
  } catch {
    return judgeChanges({ asked, unknown: `${base} is not a commit here, so nothing can be compared` })
  }
  const lines = (out) => out.split('\n').filter(Boolean)
  const paths = [...lines(git(root, ['diff', '--name-only', base])),
    ...lines(git(root, ['ls-files', '--others', '--exclude-standard', '--', ...UPGRADE_PATHS]))]
  let keysBase
  let keysNow
  try {
    keysBase = computeKeys({ cwd: root, ref: base })
    keysNow = computeKeys({ cwd: root, worktree: true })
  } catch (err) {
    return judgeChanges({ asked, unknown: `the image keys could not be compared with ${base} (${err.message.split('\n')[0]})` })
  }
  let before = null
  try {
    before = git(root, ['show', `${base}:${POSTGRES_FILE}`])
  } catch { /* no such file at the base: it changed */ }
  const postgres = { base: postgresImage(before), now: postgresImage(readFileSync(join(root, POSTGRES_FILE), 'utf8')) }
  return judgeChanges({ paths, keysBase, keysNow, postgres, asked })
}
