#!/usr/bin/env node
// Takes the npm updates every module's package.json already allows: `npm update --package-lock-only` in each module with
// a lockfile, so only lockfiles move and nothing is installed. A package.json that changes, or an update npm refuses (a
// peer conflict, for one), fails it, naming the module. Run by scripts/deps/update.sh; writes what moved, as JSON, to
// --out: the packages each module names, version to version, and a count of the others.
//   node scripts/deps/npm.mjs --out <file>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const versionsOf = lock => new Map(Object.entries(lock.packages ?? {}).filter(([k]) => k.includes('node_modules/')).map(([k, v]) => [k, v.version]))

export function lockMoves(module, pkg, before, after) {
  const named = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies }))
  const was = versionsOf(before)
  const now = versionsOf(after)
  const moves = []
  let others = 0
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    if (was.get(key) === now.get(key)) continue
    const name = key.slice('node_modules/'.length)
    if (key.startsWith('node_modules/') && named.has(name) && was.has(key) && now.has(key)) {
      moves.push({ module, name, from: was.get(key), to: now.get(key) })
    } else others++
  }
  moves.sort((a, b) => a.name.localeCompare(b.name))
  return { moves, others }
}

function main() {
  const out = process.argv[process.argv.indexOf('--out') + 1]
  if (!process.argv.includes('--out') || !out) throw new Error('Usage: node scripts/deps/npm.mjs --out <file>')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const dirs = execFileSync('git', ['ls-files', '*package-lock.json'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).map(f => path.dirname(f))
  const result = { moves: [], others: {} }
  for (const dir of dirs) {
    const module = dir === '.' ? 'root' : dir
    const at = f => path.join(root, dir, f)
    // Held to what is committed, so nothing run before this (hq's install and compile) may change it either.
    const pkgText = execFileSync('git', ['show', `HEAD:${path.posix.join(dir, 'package.json')}`], { cwd: root, encoding: 'utf8' })
    const before = JSON.parse(fs.readFileSync(at('package-lock.json'), 'utf8'))
    console.error(`npm update in ${module}`)
    try {
      execFileSync('npm', ['update', '--package-lock-only', '--no-audit', '--no-fund'], { cwd: path.join(root, dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      const said = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n')
      throw new Error(`${module}: npm refused the update (a peer conflict names the packages below):\n${said}`)
    }
    if (fs.readFileSync(at('package.json'), 'utf8') !== pkgText) {
      fs.writeFileSync(at('package.json'), pkgText)
      throw new Error(`${module}: package.json changed during the update; an update moves only the lockfile (its change was undone).`)
    }
    const { moves, others } = lockMoves(module, JSON.parse(pkgText), before, JSON.parse(fs.readFileSync(at('package-lock.json'), 'utf8')))
    result.moves.push(...moves)
    if (others) result.others[module] = others
  }
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`npm: ${error.message}`); process.exit(1) }
}
