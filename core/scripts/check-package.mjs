#!/usr/bin/env node
/**
 * Checks core as a package the way a project outside this repository uses it, after `npm run build`: packs it,
 * installs the packed file into an empty project, type-checks an import of every entry point under TypeScript's
 * Node module rules, and imports each with plain `node`. The apps here bundle core, and Vitest resolves like a
 * bundler, so neither would notice a package that Node itself refuses.
 *
 *   npm run build && node scripts/check-package.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const core = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8'))
const entries = Object.keys(pkg.exports).map(e => (e === '.' ? pkg.name : `${pkg.name}/${e.slice(2)}`))
const tsc = path.join(core, 'node_modules', 'typescript', 'bin', 'tsc')
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-package-'))
try {
  const tarball = path.join(dir, run('npm', ['pack', '--silent', '--pack-destination', dir], core).trim().split('\n').pop())
  const project = path.join(dir, 'project')
  fs.mkdirSync(project)
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--offline', tarball], project)

  fs.writeFileSync(path.join(project, 'check.ts'), entries.map((e, i) => `export * as entry${i} from '${e}'\n`).join(''))
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true, noEmit: true, types: [] },
    files: ['check.ts'],
  }))
  run(process.execPath, [tsc, '-p', '.'], project)

  for (const e of entries) {
    const count = run(process.execPath, ['--input-type=module', '-e', `const m = await import('${e}'); console.log(Object.keys(m).length)`], project).trim()
    if (!(Number(count) > 0)) throw new Error(`${e} imported with nothing in it`)
    console.log(`${e}: ${count} exports, loads in plain Node and type-checks under NodeNext`)
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
