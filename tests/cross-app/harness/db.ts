// Dual-Prisma access to both apps' test databases, plus the two seeding
// helpers globalSetup.ts needs before either app boots.
//
// Each app's PrismaClient is loaded from THAT app's own node_modules (not
// this package's — it has no @prisma/client dependency of its own) and
// constructed with an explicit datasource override, never ambient env. Same
// pattern as hq/e2e/fixtures/seed-e2e-data.mjs:34-55, and for the same
// reason: a bare `new PrismaClient()` would pick up whatever DATABASE_URL
// happens to be in process.env, and hq's and site's differ.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { HQ_ROOT, HQ_TEST_DATABASE_URL, SITE_ROOT, SITE_ROOT_DIR, SITE_TEST_DATABASE_URL } from './env'

const require = createRequire(import.meta.url)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient: HqPrismaClient } = require(join(HQ_ROOT, 'node_modules/@prisma/client'))
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient: SitePrismaClient } = require(join(SITE_ROOT, 'node_modules/@prisma/client'))

// Untyped `any` (via createRequire above, not a static import) — each app's
// own generated Prisma client has a schema-specific shape this package has
// no type declarations for.
export const hqDb = new HqPrismaClient({ datasources: { db: { url: HQ_TEST_DATABASE_URL } } })
export const siteDb = new SitePrismaClient({ datasources: { db: { url: SITE_TEST_DATABASE_URL } } })

async function truncateOne(client: { $queryRaw: Function; $executeRawUnsafe: Function }): Promise<void> {
  // Structural guard, not just a naming convention: refuse to run the
  // destructive TRUNCATE below against whatever database this client
  // actually landed on, not just whatever URL we think we passed it.
  const [{ current_database: dbName }]: { current_database: string }[] = await client.$queryRaw`SELECT current_database()`
  if (!dbName.endsWith('_test')) {
    throw new Error(`refusing to truncate: connected database "${dbName}" is not a _test database`)
  }

  const rows: { tablename: string }[] = await client.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** Truncates every table (except the Prisma migration ledger) in both test databases. */
export async function truncateAll(): Promise<void> {
  await truncateOne(hqDb)
  await truncateOne(siteDb)
}

function runNode(scriptPath: string, cwd: string, env: NodeJS.ProcessEnv, logPath: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const log = createWriteStream(logPath, { flags: 'a' })
    const child = spawn(process.execPath, [scriptPath], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    child.on('close', () => log.end())
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${scriptPath} exited with code ${code} — see ${logPath}`))
    })
  })
}

/** Seeds only the e2e-admin / e2e-operator accounts — no Org row. Idempotent. */
export async function seedUsers(): Promise<void> {
  await runNode(
    join(HQ_ROOT, 'e2e/fixtures/seed-e2e-users.mjs'),
    HQ_ROOT,
    // No Org here: seedBase adds one for the suites that need it, and the pairing
    // suite asserts hq creates its own at boot.
    { ...process.env, DATABASE_URL: HQ_TEST_DATABASE_URL, E2E_SEED_NO_ORG: '1' },
    join(SITE_ROOT_DIR, 'seed-e2e-users.log'),
  )
}

/**
 * Seeds the accounts and minimal Org row the cross-app suites depend on.
 * Idempotent — safe to call on a freshly truncated database or one that
 * already has these rows (e.g. a second run in the same session).
 */
export async function seedBase(): Promise<void> {
  await seedUsers()

  // seed-e2e-users.mjs creates the e2e-admin/e2e-operator accounts but no Org,
  // and hq makes its own only when it boots paired with its default site
  // (04-pairing checks that) — which 00-01b do not. Minimal row: schema.prisma's
  // Org model only requires `name` (everything else defaults).
  const existing = await hqDb.org.findFirst()
  if (!existing) {
    await hqDb.org.create({ data: { name: 'Cross-App Test Org' } })
  }
}
