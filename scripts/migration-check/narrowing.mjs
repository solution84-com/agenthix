// What in a migration loses data an installation holds: a table or column dropped, a column's type changed, or a
// column made required with no default and no backfill before it. The migration check refuses such a migration unless
// the commit that added it is marked breaking (CONTRIBUTING.md), and the Release's break scan
// (scripts/release/breaks.mjs) lists it.
//
//   node scripts/migration-check/narrowing.mjs <release>    each loss in a migration this working tree adds since
//                                                           <release> that no commit marked breaking made; exits 1 if any
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMarkedBreaking } from '../release/breaks/commits.mjs'

const NAME = String.raw`"?([A-Za-z_][\w$]*)"?`
const QUALIFIED = String.raw`(?:"?[A-Za-z_][\w$]*"?\.)?${NAME}`

function withoutComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Splits on what is outside parentheses and quotes: statements on `;`, an ALTER TABLE's actions on `,`. */
function splitTop(text, separator) {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === quote) quote = null; continue }
    if (c === "'" || c === '"') quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Each loss in one migration's SQL, as `{ what, table, column? }`, in the order they appear. */
export function dataLosses(sql) {
  const losses = []
  const defaults = new Set()
  const backfilled = new Set()
  const statements = splitTop(withoutComments(sql), ';')
  // A default set anywhere in the migration covers a column made required in it.
  for (const statement of statements) {
    const alter = statement.match(new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?${QUALIFIED}\s+([\s\S]*)$`, 'i'))
    if (!alter) continue
    for (const action of splitTop(alter[2], ',')) {
      const set = action.match(new RegExp(String.raw`^ALTER\s+(?:COLUMN\s+)?${NAME}\s+SET\s+DEFAULT\b`, 'i'))
      if (set) defaults.add(`${alter[1]}.${set[1]}`)
      const added = action.match(new RegExp(String.raw`^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?${NAME}[\s\S]*\bDEFAULT\b`, 'i'))
      if (added) defaults.add(`${alter[1]}.${added[1]}`)
    }
  }
  for (const statement of statements) {
    const dropTable = statement.match(new RegExp(String.raw`^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\s\S]+?)(?:\s+(?:CASCADE|RESTRICT))?$`, 'i'))
    if (dropTable) {
      for (const name of dropTable[1].split(',')) {
        const table = name.trim().match(new RegExp(`^${QUALIFIED}$`))
        if (table) losses.push({ what: 'drops the table', table: table[1] })
      }
      continue
    }
    const update = statement.match(new RegExp(String.raw`^UPDATE\s+(?:ONLY\s+)?${QUALIFIED}\s`, 'i'))
    if (update) { backfilled.add(update[1]); continue }
    const alter = statement.match(new RegExp(String.raw`^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?${QUALIFIED}\s+([\s\S]*)$`, 'i'))
    if (!alter) continue
    const table = alter[1]
    for (const action of splitTop(alter[2], ',')) {
      const drop = action.match(new RegExp(String.raw`^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?${NAME}`, 'i'))
      if (drop && !/^DROP\s+(CONSTRAINT|DEFAULT|NOT\s+NULL)\b/i.test(action)) {
        losses.push({ what: 'drops the column', table, column: drop[1] })
        continue
      }
      const type = action.match(new RegExp(String.raw`^ALTER\s+(?:COLUMN\s+)?${NAME}\s+(?:SET\s+DATA\s+)?TYPE\b`, 'i'))
      if (type) { losses.push({ what: "changes the column's type", table, column: type[1] }); continue }
      const required = action.match(new RegExp(String.raw`^ALTER\s+(?:COLUMN\s+)?${NAME}\s+SET\s+NOT\s+NULL\b`, 'i'))
      if (required && !defaults.has(`${table}.${required[1]}`) && !backfilled.has(table)) {
        losses.push({ what: 'makes the column required with no default or backfill', table, column: required[1] })
      }
    }
  }
  return losses
}

export function describeLoss(migration, loss) {
  return `${migration} ${loss.what} ${loss.column ? `"${loss.table}"."${loss.column}"` : `"${loss.table}"`}`
}

const MIGRATIONS = ['hq/migrations', 'site/migrations']

/**
 * The migration files added since `release`, each with the messages of the commits that added or changed it: at HEAD,
 * or with `tree`, in the working tree, where a migration not yet committed has no commit to mark it.
 */
export function newMigrations(git, release, { tree = false } = {}) {
  const added = tree
    ? [...git(['diff', '--name-only', '--diff-filter=A', release, '--', ...MIGRATIONS]).split('\n'),
      ...git(['ls-files', '--others', '--exclude-standard', '--', ...MIGRATIONS]).split('\n')]
    : git(['diff', '--name-only', '--diff-filter=A', release, 'HEAD', '--', ...MIGRATIONS]).split('\n')
  const files = [...new Set(added)].filter((f) => f.endsWith('/migration.sql')).sort()
  return files.map((file) => ({
    file,
    messages: git(['log', '--format=%B%x00', `${release}..HEAD`, '--', file]).split('\0').map((m) => m.trim()).filter(Boolean),
  }))
}

/** What the migration check refuses: each loss in a new migration none of whose commits is marked breaking. */
export function unmarkedLosses(migrations, read) {
  return migrations.flatMap(({ file, messages }) =>
    messages.some(isMarkedBreaking) ? [] : dataLosses(read(file)).map((loss) => describeLoss(file, loss)))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [release] = process.argv.slice(2)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const found = unmarkedLosses(newMigrations(git, release, { tree: true }), (file) => readFileSync(join(root, file), 'utf8'))
  if (found.length) {
    console.error(`A migration since ${release} loses data, and no commit that made it is marked breaking:`)
    for (const line of found) console.error(`  ${line}`)
    console.error('Carry the data forward instead (add, backfill, then tighten), or mark the commit `type(area)!: …` with a\n`BREAKING CHANGE: <what an installation must do>` footer (CONTRIBUTING.md).')
    process.exit(1)
  }
}
