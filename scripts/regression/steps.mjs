// Every step of the regression, its group, and which of them a selection runs. Plain data and pure functions: run.mjs
// runs what this returns.
//
// A step: { id, group, cwd (from the repository's root), cmd, env, kind, script }
//   kind  'vitest'  a Vitest run through an npm script; the runner adds a JSON report and reruns failures alone
//         'chain'   a Vitest suite whose files build on each other (cross-app): a failure reruns the whole suite once
//         'stack'   an e2e run on a stack of its own (e2e-stack.mjs), which reruns its own failures
//         'plain'   anything else: its exit code is its result
//   stack  true for a plain step that boots a stack of its own, counted with the stack steps

export const MODULES = ['core', 'ui', 'site', 'relay', 'host', 'console', 'console-web', 'hq']
export const GROUPS = ['prepare', 'units', 'integration', 'docker', 'stacks']

/**
 * Each database client of a cross-app or e2e run opens at most this many connections. Four runs beside the integration
 * suite share the run's database server (testdb.mjs); uncapped (Prisma's default is twice the processor count, plus
 * one) they ran out of a server's connections once.
 */
export const DB_CONNECTION_LIMIT = 5

/**
 * What a step weighs in close-out mode (schedule.mjs): `slots` for a step of fixed weight (1 when unsaid), or
 * `workers: [min, max]` for a Vitest or Playwright step sized when it starts, plus `stackSlots` for the servers of its
 * stack. The Vitest configs run four workers when not told otherwise, so four is a step's most unless it says more.
 */
const VITEST_WORKERS = [1, 4]

const vitest = (id, group, cwd, script, extra = {}) => ({ id, group, cwd, cmd: ['npm', 'run', script, '--'], kind: 'vitest', script, workers: VITEST_WORKERS, ...extra })
const plain = (id, group, cwd, cmd, extra = {}) => ({ id, group, cwd, cmd, kind: 'plain', ...extra })

/**
 * The selection: { full, modules: Set, integration: Set, crossApp, e2e, allFlags, imageParts: string[] | null,
 * installTest, containers }. `imageParts` null runs no image start test; [] runs every part.
 */
export function selectionFromAffected(result, { staleImageParts = [] } = {}) {
  const jobs = new Set(result.selected)
  const modules = new Set(MODULES.filter((m) => jobs.has(m)))
  return {
    full: false,
    modules,
    integration: new Set(['hq', 'site'].filter((m) => jobs.has(`${m}-integration`))),
    crossApp: ['hq', 'site', 'core'].some((m) => modules.has(m)),
    e2e: modules.has('hq') || modules.has('ui'),
    allFlags: false,
    imageParts: staleImageParts.length ? staleImageParts : null,
    installTest: staleImageParts.length > 0,
    containers: false,
  }
}

export function fullSelection() {
  return {
    full: true, modules: new Set(MODULES), integration: new Set(['hq', 'site']), crossApp: true, e2e: true,
    allFlags: true, imageParts: [], installTest: true, containers: true,
  }
}

/** The steps a selection runs, in order within each group. `logs` is where steps that write logs of their own put them. */
export function planSteps(sel, { logs }) {
  const has = (m) => sel.modules.has(m)
  const stacks = sel.crossApp || sel.e2e
  const steps = []
  const add = (cond, step) => { if (cond) steps.push(step) }

  add(sel.modules.size > 0 || stacks, plain('core-build', 'prepare', 'core', ['npm', 'run', 'build']))
  add(has('hq') || stacks, plain('hq-build', 'prepare', '.', ['node', 'scripts/regression/hq-built.mjs', '--build']))
  add(stacks, plain('relay-build', 'prepare', 'relay', ['npm', 'run', 'build']))
  add(stacks, plain('platform-guide', 'prepare', 'hq', ['node', 'scripts/guide/build-platform-guide.mjs']))
  add(sel.crossApp, plain('cross-app-install', 'prepare', 'tests/cross-app', ['sh', '-c', '[ -d node_modules ] || npm ci --no-audit --no-fund']))

  steps.push(plain('secure-page', 'units', '.', ['sh', '-c', 'node --test scripts/__tests__/check-secure-page.test.mjs && node scripts/check-secure-page.mjs']))
  steps.push(plain('scripts-tests', 'units', '.', ['sh', '-c', 'node --test scripts/__tests__/*.test.mjs']))
  add(has('core'), vitest('core-test', 'units', 'core', 'test'))
  for (const m of ['ui', 'site', 'relay', 'host', 'console', 'console-web']) {
    if (!has(m)) continue
    // ui's npm script is not its typecheck (the testing-a-change skill): tsc is.
    steps.push(plain(`${m}-typecheck`, 'units', m, m === 'ui' ? ['npx', 'tsc', '--noEmit'] : ['npm', 'run', 'typecheck']))
    if (m === 'site') steps.push(plain('site-plugin-typecheck', 'units', 'site/opencode-plugin', ['npm', 'run', 'typecheck']))
    steps.push(vitest(`${m}-test`, 'units', m, 'test'))
  }
  if (has('hq')) {
    steps.push(plain('hq-typecheck', 'units', 'hq', ['npm', 'run', 'typecheck']))
    steps.push(plain('hq-typecheck-guide', 'units', 'hq', ['npm', 'run', 'typecheck:guide']))
    steps.push(vitest('hq-test', 'units', 'hq', 'test', { workers: [2, 4] }))
    steps.push(plain('hq-web-address', 'units', '.', ['sh', 'hq/docker/test/web-address.test.sh']))
  }
  add(sel.crossApp, plain('cross-app-harness', 'units', 'tests/cross-app', ['sh', '-c', 'npm run typecheck && npm run test:unit']))

  add(sel.integration.has('site'), vitest('site-integration', 'integration', 'site', 'test:integration'))
  // A key only for this step, as CI makes one: nothing else in the run is given SECRETS_MASTER_KEY. Its workers wait on
  // the database far more than on the processor, so it may run more of them, each on a test database of its own
  // (TEST_DB_WORKERS follows its workers). Eight, not more: each worker's pool may open 20 connections to the run's
  // database server (testdb.mjs), whose limit is 300, and the e2e and cross-app runs use it too.
  add(sel.integration.has('hq'), vitest('hq-integration', 'integration', 'hq', 'test:integration', { secretsKey: true, dbWorkers: true, workers: [2, 8] }))

  // One after another: the install test installs the images the start test built, and the container suites run one
  // file at a time against Docker. Their weight is Docker's builds and containers, not Node's workers.
  const docker = { lane: 'docker', slots: 2 }
  add(sel.imageParts !== null, plain('images', 'docker', '.', ['scripts/images/start-test-all.sh', ...(sel.imageParts ?? [])], { ...docker, slots: 3 }))
  add(sel.installTest, plain('install-test', 'docker', '.', ['scripts/install-test/run.sh'], { ...docker, env: { INSTALL_TEST_LOGS: `${logs}/install-test` } }))
  add(sel.containers, vitest('host-container', 'docker', 'host', 'test:container', { ...docker, workers: undefined }))
  add(sel.containers, vitest('site-container', 'docker', 'site', 'test:container', { ...docker, workers: undefined }))

  // A cross-app run: its stack's servers and one test file at a time. An e2e run: its stack, and a browser per worker.
  const crossApp = (id, env) => ({ id, group: 'stacks', cwd: 'tests/cross-app', cmd: ['npx', 'vitest', 'run'], kind: 'chain', slots: 2, env: { CROSSAPP_PREBUILT: '1', CROSSAPP_DB_CONNECTION_LIMIT: String(DB_CONNECTION_LIMIT), ...env } })
  const e2e = (id, flags) => ({ id, group: 'stacks', cwd: '.', cmd: ['node', 'scripts/regression/e2e-stack.mjs', '--flags', flags, '--out', `${logs}/${id}`], kind: 'stack', out: `${logs}/${id}`, workers: [2, 3], stackSlots: 1 })
  add(sel.crossApp, crossApp('cross-app', {}))
  add(sel.crossApp && sel.allFlags, crossApp('cross-app-all-flags', { TEST_ALL_FEATURES: '1' }))
  add(sel.e2e, e2e('e2e', 'shipped'))
  add(sel.e2e && sel.allFlags, e2e('e2e-all-flags', 'all'))
  // The user guide's screenshots, as the release rehearsal and GitHub take them (scripts/guide/capture.mjs): its own
  // hq and site, and one browser. A stack, so it counts toward the stacks run at once.
  add(sel.e2e, plain('guide-capture', 'stacks', '.', ['node', 'scripts/guide/capture.mjs', '--no-build', '--logs', `${logs}/guide-capture`], { slots: 2, stack: true }))
  return steps
}

/** Variables no step inherits from the caller's shell: each step that needs one is given its own. */
export const NEVER_INHERITED = [/^SECRETS_MASTER_KEY$/, /^TEST_DB_SERVER_URL$/, /^TEST_ALL_FEATURES$/, /^TEST_DB_NAME$/, /^TEST_DB_WORKERS$/,
  /^VITEST_MAX_WORKERS$/, /^CROSSAPP_/, /^E2E_/, /^EXPERIMENTAL_FAILURES_DIR$/, /^PLAYWRIGHT_JSON_OUTPUT_NAME$/]

export function baseEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !NEVER_INHERITED.some((re) => re.test(k))))
}
