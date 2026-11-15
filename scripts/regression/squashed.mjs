// Whether an app's migrations were squashed after a release: the release's oldest migration is not in this tree.
// The migration check and the upgrade test start from a release's schema and apply this tree's migrations on top, which
// cannot work across a squash (the one new migration creates tables the release's chain made). An installation from
// before a squash is reinstalled, not upgraded, so both scripts skip.
//
//   node scripts/regression/squashed.mjs <release> <app>    prints the skip line when squashed, nothing when not;
//                                                           exits non-zero only when it cannot tell
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The release's oldest migration folder when the tree does not have it, else null. Names sort by their timestamp. */
export function squashedAt(releaseMigrations, treeMigrations) {
  const oldest = [...releaseMigrations].sort()[0]
  if (oldest === undefined) return null
  return treeMigrations.includes(oldest) ? null : oldest
}

export function skipLine(release, app, oldest) {
  return `Skipped: the migrations were squashed after ${release} (${app}'s first migration there, ${oldest}, is not in this tree). An installation of ${release} is reinstalled, not upgraded.`
}

const folders = (names) => names.filter((n) => n && !n.endsWith('.toml'))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [release, app] = process.argv.slice(2)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const atRelease = folders(execFileSync('git', ['-C', root, 'ls-tree', '--name-only', `${release}:${app}/migrations`], { encoding: 'utf8' }).split('\n'))
  const oldest = squashedAt(atRelease, folders(readdirSync(join(root, app, 'migrations'))))
  if (oldest) console.log(skipLine(release, app, oldest))
}
