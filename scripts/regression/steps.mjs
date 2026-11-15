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
 * hq's type checks and Wasp's compile grew past Node's default heap; CI gives them this much, and so does the run.
 */
const HQ_HEAP = { NODE_OPTIONS: '--max-old-space-size=4096' }

/**
 * The selection: { full, modules: Set, integration: Set, crossApp, e2e, allFlags, imageParts: string[] | null,
 * installTest, containers, dependencies, migrationCheck, upgradeTest }. `imageParts` null runs no image start test;
 * [] runs every part. `upgradeTest` is why the upgrade test runs, or null; `changes` is what changes.mjs judged.
 */
export function selectionFromAffected(result, { staleImageParts = [], changes = {} } = {}) {
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
    dependencies: jobs.has('dependencies'),
    migrationCheck: Boolean(changes.migrations),
    upgradeTest: changes.upgrade ?? null,
  }
}

/** Everything, the migration check included; the upgrade test only when what it proves changed (`changes`). */
export function fullSelection({ changes = {} } = {}) {
  return {
    full: true, modules: new Set(MODULES), integration: new Set(['hq', 'site']), crossApp: true, e2e: true,
    allFlags: true, imageParts: [], installTest: true, containers: true, dependencies: true, migrationCheck: true,
    upgradeTest: changes.upgrade ?? null,
  }
}

// actionlint checks the workflows, and each `run:` block with shellcheck when shellcheck is installed; without it the
// shell would go unchecked, so the step needs both.
const LINT_WORKFLOWS = [
  'command -v actionlint >/dev/null || { echo "actionlint is not installed: brew install actionlint (or see https://github.com/rhysd/actionlint/blob/main/docs/install.md)"; exit 1; }',
  'command -v shellcheck >/dev/null || { echo "shellcheck is not installed, so actionlint would not check the workflows\' shell: brew install shellcheck"; exit 1; }',
  'actionlint',
].join('\n')

/** The steps a selection runs, in order within each group. `logs` is where steps that write logs of their own put them. */
export function planSteps(sel, { logs }) {
  const has = (m) => sel.modules.has(m)
  const stacks = sel.crossApp || sel.e2e
  const steps = []
  const add = (cond, step) => { if (cond) steps.push(step) }

  const coreBuilt = sel.modules.size > 0 || stacks
  add(coreBuilt, plain('core-build', 'prepare', 'core', ['npm', 'run', 'build']))
  // The site's database client, made from its schema as CI's install makes it: one made before a schema change answers
  // with the old columns, and the site doesn't start.
  add(has('site') || stacks, plain('site-client', 'prepare', 'site', ['npx', 'prisma', 'generate']))
  add(has('hq') || stacks, plain('hq-build', 'prepare', '.', ['node', 'scripts/regression/hq-built.mjs', '--build'], { env: HQ_HEAP }))
  add(stacks, plain('relay-build', 'prepare', 'relay', ['npm', 'run', 'build']))
  add(stacks, plain('platform-guide', 'prepare', 'hq', ['node', 'scripts/guide/build-platform-guide.mjs']))
  add(sel.crossApp, plain('cross-app-install', 'prepare', 'tests/cross-app', ['sh', '-c', '[ -d node_modules ] || npm ci --no-audit --no-fund']))

  steps.push(plain('secure-page', 'units', '.', ['sh', '-c', 'node --test scripts/__tests__/check-secure-page.test.mjs && node scripts/check-secure-page.mjs']))
  // With the tests of the robots bundle and the contributor agreement, which Checks runs beside them.
  steps.push(plain('scripts-tests', 'units', '.', ['sh', '-c', 'node --test scripts/__tests__/*.test.mjs scripts/robots/__tests__/*.test.mjs scripts/cla/__tests__/*.test.mjs']))
  // The installs are all made before (prepare): no lockfile may differ from what was committed.
  steps.push(plain('lockfiles-held', 'units', '.', ['scripts/deps/held.sh']))
  add(sel.dependencies, plain('dependency-rules', 'units', '.', ['sh', '-c', 'node --test "scripts/deps/__tests__/*.test.mjs" && node scripts/deps/check.mjs']))
  add(sel.dependencies, plain('workflows-lint', 'units', '.', ['sh', '-c', LINT_WORKFLOWS]))
  // The release's and the install test's scripts, as the release build and the install test run them; one reads core's build.
  add(coreBuilt, plain('release-scripts-tests', 'units', '.', ['sh', '-c', 'node --test "scripts/release/__tests__/*.test.mjs" "scripts/install-test/__tests__/*.test.mjs"']))
  add(has('core'), vitest('core-test', 'units', 'core', 'test'))
  // core as a project outside this repository installs it, and as the release packs it.
  add(has('core'), plain('core-package', 'units', 'core', ['sh', '-c', 'npm run check:package && npm pack --dry-run']))
  for (const m of ['ui', 'site', 'relay', 'host', 'console', 'console-web']) {
    if (!has(m)) continue
    // ui's npm script is not its typecheck (the testing-a-change skill): tsc is.
    steps.push(plain(`${m}-typecheck`, 'units', m, m === 'ui' ? ['npx', 'tsc', '--noEmit'] : ['npm', 'run', 'typecheck']))
    if (m === 'site') steps.push(plain('site-plugin-typecheck', 'units', 'site/opencode-plugin', ['npm', 'run', 'typecheck']))
    steps.push(vitest(`${m}-test`, 'units', m, 'test'))
    // The builds CI makes, and the host service's bundles started as its image starts them. console-web's build is
    // the one the guide's capture makes again, into the same folder, so the two run one after the other.
    if (m === 'host') steps.push(plain('host-build', 'units', m, ['sh', '-c', 'npm run build && npm run check:bundles']))
    if (m === 'console') steps.push(plain('console-build', 'units', m, ['npm', 'run', 'build']))
    if (m === 'console-web') steps.push(plain('console-web-build', 'units', m, ['npm', 'run', 'build'], { lane: 'guide' }))
  }
  if (has('hq')) {
    steps.push(plain('hq-typecheck', 'units', 'hq', ['npm', 'run', 'typecheck'], { env: HQ_HEAP }))
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
  // From the newest release's images to the ones just built, and put back from a forced failure (changes.mjs says when).
  add(sel.upgradeTest != null, plain('upgrade-test', 'docker', '.', ['scripts/upgrade-test/run.sh'], { ...docker, env: { UPGRADE_TEST_LOGS: `${logs}/upgrade-test` } }))
  add(sel.containers, vitest('host-container', 'docker', 'host', 'test:container', { ...docker, workers: undefined }))
  add(sel.containers, vitest('site-container', 'docker', 'site', 'test:container', { ...docker, workers: undefined }))
  // A Postgres container of its own, and Prisma: no image built, so it runs beside the Docker steps.
  add(sel.migrationCheck, plain('migration-check', 'docker', '.', ['scripts/migration-check/run.sh']))

  // A cross-app run: its stack's servers and one test file at a time. An e2e run: its stack, and a browser per worker.
  const crossApp = (id, env) => ({ id, group: 'stacks', cwd: 'tests/cross-app', cmd: ['npx', 'vitest', 'run'], kind: 'chain', slots: 2, env: { CROSSAPP_PREBUILT: '1', CROSSAPP_DB_CONNECTION_LIMIT: String(DB_CONNECTION_LIMIT), ...env } })
  const e2e = (id, flags) => ({ id, group: 'stacks', cwd: '.', cmd: ['node', 'scripts/regression/e2e-stack.mjs', '--flags', flags, '--out', `${logs}/${id}`], kind: 'stack', out: `${logs}/${id}`, workers: [2, 3], stackSlots: 1 })
  add(sel.crossApp, crossApp('cross-app', {}))
  add(sel.crossApp && sel.allFlags, crossApp('cross-app-all-flags', { TEST_ALL_FEATURES: '1' }))
  add(sel.e2e, e2e('e2e', 'shipped'))
  add(sel.e2e && sel.allFlags, e2e('e2e-all-flags', 'all'))
  // The user guide's screenshots, as the release rehearsal and GitHub take them (scripts/guide/capture.mjs): its own
  // hq and site, and one browser. A stack, so it counts toward the stacks run at once.
  add(sel.e2e, plain('guide-capture', 'stacks', '.', ['node', 'scripts/guide/capture.mjs', '--no-build', '--logs', `${logs}/guide-capture`], { slots: 2, stack: true, lane: 'guide' }))
  // Then each screenshot against the one its page links, read from the releases with the GitHub login while the
  // repository is private, as the release rehearsal does; the report is hq/e2e/guide/.report/.
  add(sel.e2e, plain('guide-compare', 'stacks', 'hq', ['sh', '-c', 'GH_TOKEN="${GH_TOKEN:-$(gh auth token 2>/dev/null || true)}" npm run guide:compare'], { lane: 'guide' }))
  return steps
}

/** Variables no step inherits from the caller's shell: each step that needs one is given its own. */
export const NEVER_INHERITED = [/^SECRETS_MASTER_KEY$/, /^TEST_DB_SERVER_URL$/, /^TEST_ALL_FEATURES$/, /^TEST_DB_NAME$/, /^TEST_DB_WORKERS$/,
  /^VITEST_MAX_WORKERS$/, /^CROSSAPP_/, /^E2E_/, /^EXPERIMENTAL_FAILURES_DIR$/, /^PLAYWRIGHT_JSON_OUTPUT_NAME$/]

/** The caller's environment without what no step inherits, and with Wasp's telemetry off, as CI runs it. */
export function baseEnv(env) {
  return { ...Object.fromEntries(Object.entries(env).filter(([k]) => !NEVER_INHERITED.some((re) => re.test(k)))), WASP_TELEMETRY_DISABLE: '1' }
}
