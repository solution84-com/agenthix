// node --test scripts/__tests__/affected.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { describe, moduleDeps, select } from '../affected.mjs'

const deps = {
  console: ['core'], 'console-web': ['core', 'ui'], core: [], host: ['core'], hq: ['core', 'ui'], site: ['core'], ui: ['core'],
}
const run = (...paths) => select({ deps, paths })
const NO_MODULE_JOBS = ['console', 'console-web', 'core', 'host', 'hq', 'hq-integration', 'site', 'site-integration', 'ui']

test('the dependency map is read from each package.json, never listed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-'))
  const make = (name, dependencies) => {
    fs.mkdirSync(path.join(root, name))
    fs.writeFileSync(path.join(root, name, 'package.json'), JSON.stringify({ name, dependencies }))
  }
  make('a', {})
  make('b', { x: 'file:../a', y: '^1.0.0' })
  make('c', { z: 'file:../b', gone: 'file:../missing' })
  fs.mkdirSync(path.join(root, 'no-package'))
  assert.deepEqual(moduleDeps(root), { a: [], b: ['a'], c: ['b'] })
})

test('the real repository: every module but core depends on core, hq and console-web on ui', () => {
  const real = moduleDeps(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'))
  assert.deepEqual(real.core, [])
  for (const m of ['ui', 'hq', 'site', 'host', 'console', 'console-web']) assert.ok(real[m].includes('core'), m)
  for (const m of ['hq', 'console-web']) assert.ok(real[m].includes('ui'), m)
})

test('a change under a module selects its jobs and its dependents, transitively', () => {
  const r = run('ui/src/Button.tsx')
  assert.deepEqual(r.selected, ['secure-page', 'console-web', 'hq', 'hq-integration', 'ui'].sort((a, b) => r.selected.indexOf(a) - r.selected.indexOf(b)))
  assert.ok(!r.jobs.site.selected && !r.jobs.host.selected && !r.jobs.core.selected)
  assert.match(r.jobs.hq.reasons[0], /ui\/src\/Button\.tsx: under ui; hq depends on ui/)
})

test('core reaches every module, and the integration suites come with hq and site', () => {
  const r = run('core/src/index.ts')
  assert.deepEqual(NO_MODULE_JOBS.filter(j => !r.jobs[j].selected), [])
  assert.ok(run('site/src/a.ts').jobs['site-integration'].selected)
  assert.ok(!run('site/src/a.ts').jobs['hq-integration'].selected)
  assert.ok(run('hq/src/a.ts').jobs['hq-integration'].selected)
  assert.ok(!run('host/src/a.ts').jobs['hq-integration'].selected)
})

test('a nested path (site/opencode-plugin) belongs to its module', () => {
  const r = run('site/opencode-plugin/index.ts')
  assert.deepEqual(r.selected.filter(j => j !== 'secure-page'), ['site', 'site-integration'])
})

test('docs/guide selects hq and console, the rest of docs selects nothing', () => {
  const g = run('docs/guide/images/a.png')
  assert.deepEqual(g.selected.filter(j => j !== 'secure-page'), ['console', 'hq', 'hq-integration'])
  const d = run('docs/architecture/x.md', 'README.md', 'hq/AGENTS.md', '.github/CONTRIBUTING.md', 'docs/work/p/plan.md')
  assert.deepEqual(d.selected, ['secure-page'])
  assert.ok(!d.everything)
})

test('any other path selects everything: the root files, .github, scripts, tests, an unknown path', () => {
  for (const p of ['package.json', '.github/workflows/checks.yml', 'scripts/affected.mjs', 'tests/cross-app/a.test.ts', 'brand-new/file.ts', '.nvmrc']) {
    const r = run(p)
    assert.ok(r.everything, p)
    assert.deepEqual(NO_MODULE_JOBS.filter(j => !r.jobs[j].selected), [], p)
    assert.match(r.jobs.core.reasons[0], new RegExp(p.replace(/[.]/g, '\\.')))
  }
})

test('a module path that is a bare file at the root of a module is code, not a note', () => {
  assert.ok(run('hq/main.wasp.ts').jobs.hq.selected)
  assert.ok(run('hq/package.json').jobs.hq.selected)
})

test('secure-page always runs, and --all selects everything', () => {
  assert.ok(run().jobs['secure-page'].selected)
  const all = select({ deps, paths: [], all: true })
  assert.ok(all.selected.length === NO_MODULE_JOBS.length + 1)
})

test('the readable lines give a reason for each job, selected or not', () => {
  const lines = describe(run('host/src/a.ts'))
  assert.equal(lines.length, NO_MODULE_JOBS.length + 1)
  assert.ok(lines.some(l => l.startsWith('run   host: host/src/a.ts: under host')))
  assert.ok(lines.some(l => l.startsWith('skip  hq: no changed path reaches it')))
})
