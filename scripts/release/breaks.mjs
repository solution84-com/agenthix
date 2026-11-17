// Every break since the previous release, and whether this version may carry them (docs/architecture/versioning.md,
// *Breaking changes*). Release's first stage runs it before anything is built; Publish release runs it again at the
// tag to open the release notes with what it found.
//
//   node scripts/release/breaks.mjs --version <version> [--from <tag>] [--notes <file>]
//
// The previous release is the newest version tag in this commit's history below <version>, unless --from names it.
// A break is a commit marked breaking (`type(area)!: …`, a `BREAKING CHANGE:` footer), or one found by comparing the
// previous tag with this tree: a protocol's major moved (core/snapshot/), a stored format's number moved, a new
// migration that drops a table or column or narrows one (scripts/migration-check/narrowing.mjs), or an entry gone from
// a surface snapshot (core's exports, the agenthix commands and options, host.env's settings, an installation's
// names). It fails, naming each, when a found break is explained by no marked commit that changed its files, when a
// marked commit has no footer, or when the version may not break (a patch, or the same line as the previous release:
// ./breaks/verdict.mjs). Otherwise it writes the notes' "Breaking changes, and what to do" section to --notes (an
// empty file when there is none) and prints it.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLog } from './breaks/commits.mjs'
import { formatBreaks, migrationBreaks, protocolBreaks, surfaceBreaks } from './breaks/found.mjs'
import { judge, notesSection, parseVersion, previousTag } from './breaks/verdict.mjs'
import { newMigrations } from '../migration-check/narrowing.mjs'

/** `git(args)` returns git's output; `readNow(path)` a file of this tree, or null. */
export function findBreaks({ version, from, git, readNow }) {
  const previous = from ?? previousTag(git(['tag', '--merged', 'HEAD', '--list', 'v*']).split('\n').filter(Boolean), version)
  if (!previous) return { previous: null, problems: [], lines: [] }
  const before = (path) => {
    try { return git(['show', `${previous}:${path}`]) } catch { return null }
  }
  const commits = parseLog(git(['log', '--format=%H%x1f%B%x1e', `${previous}..HEAD`]))
  const migrations = newMigrations(git, previous).map((m) => m.file)
  const found = [
    ...protocolBreaks(before, readNow),
    ...formatBreaks(before, readNow),
    ...migrationBreaks(migrations, readNow),
    ...surfaceBreaks(before, readNow),
  ]
  const detected = found.map((brk) => ({
    ...brk,
    shas: git(['log', '--format=%H', `${previous}..HEAD`, '--', ...brk.files]).split('\n').filter(Boolean),
  }))
  return { previous, ...judge({ version, previous, commits, detected }) }
}

function option(args, name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const version = option(args, '--version')?.replace(/^v/, '')
  if (!version || !parseVersion(version)) {
    console.error('Usage: node scripts/release/breaks.mjs --version <version> [--from <tag>] [--notes <file>]')
    process.exit(2)
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const git = (gitArgs) => execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const readNow = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null)
  const { previous, problems, lines } = findBreaks({ version, from: option(args, '--from'), git, readNow })
  if (problems.length) {
    console.error(`::error::${version} cannot be released as it is, against ${previous}:`)
    for (const problem of problems) console.error(problem)
    console.error('A breaking commit is `type(area)!: …` with a `BREAKING CHANGE: <what an installation must do>` footer (CONTRIBUTING.md).')
    process.exit(1)
  }
  const section = notesSection(lines)
  const notes = option(args, '--notes')
  if (notes) writeFileSync(notes, section)
  if (!previous) console.log(`No earlier release in this history: ${version} has nothing to break.`)
  else console.log(section || `No breaking change since ${previous}.`)
}
