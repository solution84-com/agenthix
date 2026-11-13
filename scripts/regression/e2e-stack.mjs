#!/usr/bin/env node
// One run of hq's browser tests on a stack of its own (stack.mjs): boots it, seeds it for its flag setting, runs the
// suite, reruns each failed test alone once, then stops the stack and drops its databases, so nothing is left with
// every flag on and two runs can overlap.
//
//   node scripts/regression/e2e-stack.mjs --flags shipped|all --out <folder> [--workers N]
//
// Writes <folder>/result.json: { counts, failures, reruns, seeded } (counts and failures as results.mjs reads them),
// the Playwright report, every log and the stack's own logs. Exits 0 only when every test passed.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromPlaywright, rerunVerdict } from './results.mjs'
import { ROOT, startStack, stopStack } from './stack.mjs'

const HQ = join(ROOT, 'hq')
const SEEDS = ['seed-e2e-users.mjs', 'seed-e2e-data.mjs', 'seed-e2e-knowledge.mjs', 'seed-e2e-files.mjs']

/** The `E2E_…=value` lines a seed prints (some with `export ` before them), as variables for the suite. */
export function seededVariables(output) {
  const vars = {}
  for (const raw of output.split('\n')) {
    const m = /^(?:export\s+)?(E2E_[A-Z0-9_]+)=(.*)$/.exec(raw.trim())
    if (m) vars[m[1]] = m[2].trim()
  }
  return vars
}

function run(command, args, { cwd, env, log }) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const write = (chunk) => { output += chunk; if (log) writeFileSync(log, chunk, { flag: 'a' }) }
    child.stdout.on('data', write)
    child.stderr.on('data', write)
    child.on('error', (err) => write(`${err.message}\n`))
    child.on('close', (code) => done({ code: code ?? 1, output }))
  })
}

async function seed(stack, flags, env, out) {
  const seedEnv = {
    ...env, DATABASE_URL: stack.urls.hq, SITE_DATABASE_URL: stack.urls.site, SITE_ROOT: stack.siteRoot,
    E2E_SERVER_URL: stack.serverUrl, ...(flags === 'all' ? { TEST_ALL_FEATURES: '1' } : {}),
  }
  const vars = {}
  for (const file of SEEDS) {
    const r = await run('node', [join('e2e', 'fixtures', file)], { cwd: HQ, env: seedEnv, log: join(out, 'seed.log') })
    if (r.code !== 0) throw new Error(`${file} failed (exit ${r.code}); see ${join(out, 'seed.log')}`)
    Object.assign(vars, seededVariables(r.output))
  }
  return vars
}

function playwrightArgs(targets, { json, output, workers }) {
  return {
    args: ['playwright', 'test', ...targets, '--reporter=list,json', `--output=${output}`, ...(workers ? [`--workers=${workers}`] : [])],
    jsonEnv: { PLAYWRIGHT_JSON_OUTPUT_NAME: json },
  }
}

const readReport = (path) => {
  try {
    return fromPlaywright(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

async function main(argv) {
  const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback }
  const flags = opt('--flags', 'shipped')
  if (!['shipped', 'all'].includes(flags)) throw new Error('--flags is shipped or all')
  const out = resolve(opt('--out', join(ROOT, 'e2e-run')))
  const workers = opt('--workers', process.env.E2E_WORKERS)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('E2E_') || key === 'TEST_ALL_FEATURES') delete env[key]
  const result = { flags, counts: null, failures: [], reruns: [], seeded: [] }
  let stack = null
  let ok = false
  // Stopped from outside (the runner, Ctrl-C): the stack's processes are in groups of their own, so stop them here.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => {
      if (stack) await stopStack(stack)
      process.exit(1)
    })
  }
  try {
    stack = await startStack({ dir: join(out, 'stack'), env, onStart: (s) => { stack = s } })
    const vars = await seed(stack, flags, env, out)
    result.seeded = Object.keys(vars).sort()
    const suiteEnv = {
      ...env, ...vars, E2E_CLIENT_URL: stack.clientUrl, E2E_SERVER_URL: stack.serverUrl, E2E_REQUIRE_SEEDED: '1',
      DATABASE_URL: stack.urls.hq, SITE_DATABASE_URL: stack.urls.site, SITE_ROOT: stack.siteRoot,
      EXPERIMENTAL_FAILURES_DIR: join(out, 'experimental-failures'),
    }
    const json = join(out, 'report.json')
    const main = playwrightArgs(['--project', 'chromium', '--project', 'not-secure'], { json, output: join(out, 'test-results'), workers })
    const suite = await run('npx', main.args, { cwd: HQ, env: { ...suiteEnv, ...main.jsonEnv }, log: join(out, 'playwright.log') })
    const report = readReport(json)
    result.counts = report && { passed: report.passed, failed: report.failed, skipped: report.skipped, flaky: report.flaky }
    result.failures = report?.failures ?? []
    for (const [i, failure] of result.failures.entries()) {
      const rerunJson = join(out, `rerun-${i + 1}.json`)
      const again = playwrightArgs([`e2e/${failure.file}:${failure.line}`, '--project', failure.project], {
        json: rerunJson, output: join(out, `rerun-${i + 1}-results`), workers: 1,
      })
      const r = await run('npx', again.args, { cwd: HQ, env: { ...suiteEnv, ...again.jsonEnv }, log: join(out, `rerun-${i + 1}.log`) })
      result.reruns.push({ failure, verdict: rerunVerdict(readReport(rerunJson), r.code) })
    }
    ok = suite.code === 0 && report !== null && report.failed === 0
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    console.error(`[e2e-stack] ${result.error}`)
  } finally {
    if (stack) await stopStack(stack)
    writeFileSync(join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  }
  return ok
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit((await main(process.argv.slice(2))) ? 0 : 1)
}
