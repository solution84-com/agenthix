// Vitest global setup for the cross-app tier: provisions both test databases,
// resets them, seeds the shared fixtures, boots both real apps and hq's relay,
// and waits for all three to report ready. Runs once for the whole suite run (fileParallelism is
// off and suites run in filename order — see vitest.config.ts).
import { spawn, spawnSync } from 'node:child_process'
import { rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  HQ_ROOT,
  HQ_TEST_DATABASE_URL,
  RELAY_ROOT,
  SITE_ROOT,
  SITE_ROOT_DIR,
  SITE_TEST_DATABASE_URL,
} from './harness/env'
import { hqDb, siteDb, truncateAll, seedBase } from './harness/db'
import { startHq, startRelay, startSite, stopAll, waitForHq, waitForRelay, waitForSite, markAsProcessOwner } from './harness/apps'
import { acquireRunLock, releaseRunLock } from './harness/runLock'
import { recordedSiteIds, removeSiteLeftovers } from './harness/siteLeftovers'

/** Every id this run's site had: each recorded as it came up, and what either database still names. */
async function runSiteIds(): Promise<string[]> {
  const [registered, config]: [{ siteId: string }[], { siteId: string }[]] = await Promise.all([
    hqDb.executionSite.findMany({ select: { siteId: true } }).catch(() => []),
    siteDb.siteConfig.findMany({ select: { siteId: true } }).catch(() => []),
  ])
  return [...new Set([...recordedSiteIds(), ...registered.map(r => r.siteId), ...config.map(c => c.siteId)])]
}

function runWrapperNoop(cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', ['scripts/test/with-test-db.mjs', 'node', '-e', 'process.exit(0)'], {
      cwd,
      env,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`db provisioning failed in ${cwd} (exit ${code})`))))
  })
}

// Pins the provisioning wrapper to the exact test database the harness's own
// Prisma clients use (db.ts), and drops any ambient TEST_DB_NAME — same
// reasoning as apps.ts's spawnApp(): otherwise a developer's shell env could
// make the wrapper derive a different database than the one truncateAll()/
// seedBase() below actually operate on.
function provisionEnv(testDatabaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: testDatabaseUrl }
  delete env.TEST_DB_NAME
  return env
}

// hq's relay runs from its build, as scripts/dev/relay.sh runs it: built here, so a run never uses a stale one.
function buildRelay(): void {
  const r = spawnSync('npm', ['run', 'build'], { cwd: RELAY_ROOT, encoding: 'utf8', timeout: 120_000 })
  if (r.status !== 0) throw new Error(`hq's relay did not build: ${r.stderr || r.stdout}`)
}

async function cleanup(): Promise<void> {
  await stopAll()
  // With the site stopped, what it made is removed by its ids: a site's own sweep keeps to its current id only.
  removeSiteLeftovers(await runSiteIds())
  await Promise.all([hqDb.$disconnect(), siteDb.$disconnect()])
  releaseRunLock()
  // A temp folder left behind never fails a run whose tests passed. A run that reaches an agent's start leaves its
  // harness homes (`.claude`, `.opencode`, `.config/opencode`) here, and a machine whose own tooling puts a
  // deny-delete ACL on such folders refuses their removal.
  try {
    rmSync(SITE_ROOT_DIR, { recursive: true, force: true })
  } catch (err) {
    console.warn(`[harness] the run's temp folder ${SITE_ROOT_DIR} was not removed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export default async function globalSetup() {
  // Arms apps.ts's exit-hook orphan guard for THIS process only — see that
  // hook's own comment for why a test-file worker must never arm it.
  markAsProcessOwner()

  // Provisioning below truncates BOTH test databases, which every run shares. The ports are free ones chosen for this
  // run, so a second run would no longer be stopped by a busy port: it is stopped here, before it touches anything.
  acquireRunLock()

  // 1. Provision both test databases (create-if-missing + migrate deploy) by
  // running each app's wrapper with a no-op command — the wrapper does all
  // the provisioning work before it even gets to spawning the child command.
  //
  // This duplicates the provisioning the wrapper does again when
  // startHq()/startSite() spawn the apps below — intentional, not an
  // oversight (F13): truncateAll()/seedBase() (steps 2 & 3) need both
  // databases to already exist and be migrated, and they run BEFORE either
  // app boots, so this pass can't be dropped in favor of the boot-time
  // provisioning alone. The second pass at boot is a cheap already-satisfied
  // no-op by then (CREATE DATABASE sees "already exists", migrate deploy has
  // nothing pending) and keeps startHq/startSite simple — they always run
  // through the same wrapper regardless of what globalSetup already did.
  await runWrapperNoop(HQ_ROOT, provisionEnv(HQ_TEST_DATABASE_URL))
  await runWrapperNoop(SITE_ROOT, provisionEnv(SITE_TEST_DATABASE_URL))

  // 2 & 3. Reset to empty, then seed the fixtures every suite depends on.
  await truncateAll()
  await seedBase()

  // 4. Historical: mirror the platform assets tree into the temp SITE_ROOT
  // before boot. This predates hq no longer reading a site's disk at all —
  // hq now resolves its own assets independently (getHqAssetsRoot(), which
  // defaults from its own cwd or HQ_ASSETS_ROOT, never SITE_ROOT — this
  // harness spawns hq's `wasp start` with cwd: HQ_ROOT, the repo's real hq/
  // directory, so it finds hq/assets there directly), and site's runtime
  // reads no assets tree of its own. Neither app's current code depends on
  // this symlink; left in place as a no-op rather than removed as an
  // unrelated change.
  //
  // On a real install, SITE_ROOT/assets used to be a symlink into the repo,
  // made by hand on the machine — not anything reachable from this repo, so
  // not portable to another machine or CI.
  symlinkSync(join(HQ_ROOT, 'assets'), join(SITE_ROOT_DIR, 'assets'))
  buildRelay()

  // 5. Boot both apps and hq's relay, and wait for readiness. Promise.allSettled (not
  // Promise.all) throughout: Promise.all resolves/rejects as soon as the
  // FIRST promise settles while the other keeps running, and if that other
  // one later rejects — after the catch block below has already torn down
  // the temp dir — it fires as an unhandled rejection against resources that
  // no longer exist. allSettled always waits for both, then this surfaces
  // the first real failure (hq before site) itself.
  const startOutcomes = await Promise.allSettled([startHq(), startSite(), startRelay()])
  const startFailure = startOutcomes.find((r): r is PromiseRejectedResult => r.status === 'rejected')

  let waitFailure: PromiseRejectedResult | undefined
  if (!startFailure) {
    const waitOutcomes = await Promise.allSettled([waitForHq(), waitForSite(), waitForRelay()])
    waitFailure = waitOutcomes.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  }

  const failure = startFailure ?? waitFailure
  if (failure) {
    // A failed boot must never leave orphaned wasp processes or a stray temp
    // dir behind.
    await cleanup()
    throw failure.reason
  }

  return cleanup
}
