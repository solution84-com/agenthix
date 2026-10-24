// node scripts/affected.mjs <base> [<head>] [--json]   (or --all: a run that proves a commit whole)
// Which of the Checks workflow's jobs a change reaches, and why. Plain Node, no dependencies.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A module's jobs, when they are not just its own name.
const EXTRA_JOBS = { hq: ['hq-integration'], site: ['site-integration'] }
// docs/guide/ is checked by these modules: hq checks the screenshot names, the Fleet Console builds its Help from it.
const GUIDE_MODULES = ['hq', 'console']
// What `checks.yml` has always treated as documentation: docs/ (the guide excepted), and the Markdown notes at the top
// of the repository, of each module and in .github/.
const DOCUMENTATION = /^([^/]+\.md|[^/]+\/[^/]+\.md|\.github\/[^/]+\.md|docs\/.*)$/

/** { module: [modules it depends on] }, from each top-level package.json's `file:../<module>` dependencies. */
export function moduleDeps(root) {
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'package.json')))
    .map(d => d.name)
    .sort()
  const deps = {}
  for (const dir of dirs) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'))
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }
    deps[dir] = Object.values(all)
      .map(v => /^file:\.\.\/([^/]+)\/?$/.exec(String(v))?.[1])
      .filter(m => m && dirs.includes(m))
  }
  return deps
}

const jobsOf = module => [module, ...(EXTRA_JOBS[module] ?? [])]

/** Every module that depends on `module`, directly or not, with the chain that links them. */
function dependents(deps, module) {
  const found = new Map()
  const queue = [module]
  while (queue.length) {
    const current = queue.shift()
    for (const [name, needs] of Object.entries(deps)) {
      if (needs.includes(current) && name !== module && !found.has(name)) {
        found.set(name, current)
        queue.push(name)
      }
    }
  }
  return found
}

/** The selection for a list of changed paths. `all` forces everything (a manual run, or a base that is not known). */
export function select({ deps, paths, all = false, allReason = 'a full run was asked for' }) {
  const modules = Object.keys(deps)
  const jobNames = ['secure-page', ...modules.flatMap(jobsOf)]
  const reasons = Object.fromEntries(jobNames.map(j => [j, []]))
  reasons['secure-page'].push('it always runs: it is cheap and reads the whole repository')

  const reachModule = (module, why) => {
    for (const job of jobsOf(module)) reasons[job].push(why)
    for (const [dependent, via] of dependents(deps, module)) {
      for (const job of jobsOf(dependent)) reasons[job].push(`${why}; ${dependent} depends on ${via}`)
    }
  }

  let everything = all ? allReason : null
  for (const p of paths.filter(Boolean)) {
    if (everything) break
    const top = p.split('/')[0]
    if (p.startsWith('docs/guide/')) {
      for (const m of GUIDE_MODULES.filter(m => modules.includes(m))) reachModule(m, `${p}: the guide is checked by ${m}`)
    } else if (DOCUMENTATION.test(p)) {
      // documentation alone selects nothing
    } else if (modules.includes(top) && p.includes('/')) {
      reachModule(top, `${p}: under ${top}`)
    } else {
      everything = `${p}: not documentation and not under a module, so it may reach any of them`
    }
  }
  if (everything) for (const job of jobNames) if (job !== 'secure-page') reasons[job].push(everything)

  const jobs = Object.fromEntries(jobNames.map(j => {
    const why = [...new Set(reasons[j])]
    return [j, why.length ? { selected: true, reasons: why } : { selected: false, reasons: ['no changed path reaches it'] }]
  }))
  return { everything: Boolean(everything), selected: jobNames.filter(j => jobs[j].selected), jobs }
}

export function describe(result) {
  return Object.entries(result.jobs).map(([job, { selected, reasons }]) => {
    const shown = reasons.slice(0, 3).join(' | ') + (reasons.length > 3 ? ` | and ${reasons.length - 3} more` : '')
    return `${selected ? 'run ' : 'skip'}  ${job}: ${shown}`
  })
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

export function main(argv, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const json = argv.includes('--json')
  const args = argv.filter(a => !a.startsWith('--'))
  const deps = moduleDeps(root)
  let result
  if (argv.includes('--all')) {
    result = select({ deps, paths: [], all: true })
  } else {
    const [base, head = 'HEAD'] = args
    let known = Boolean(base)
    try { if (known) git(['cat-file', '-e', `${base}^{commit}`], root) } catch { known = false }
    const paths = known ? git(['diff', '--name-only', base, head], root).split('\n').filter(Boolean) : []
    // Nothing to compare (no base, or no differing path) runs everything rather than nothing.
    result = known && paths.length
      ? select({ deps, paths })
      : select({ deps, paths: [], all: true, allReason: known ? 'the two commits do not differ in any path' : 'there is no earlier commit to compare with' })
  }
  process.stdout.write(json ? `${JSON.stringify(result)}\n` : `${describe(result).join('\n')}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
