// Resolved once at import time. This is the single source of truth for paths,
// ports and test-database URLs used by the whole cross-app tier.
//
// The harness never boots the apps with these DB URLs directly — that's the
// wrappers' job (scripts/test/with-test-db.mjs in each app, invoked by
// apps.ts). This module only needs the URLs so db.ts can connect Prisma
// clients directly at the same test databases the wrappers provision.
import dotenv from 'dotenv'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePorts } from './freePorts'

const here = dirname(fileURLToPath(import.meta.url))

// Walk up from this file until a directory containing both hq/ and site/ is
// found. Robust to this package being run from any cwd (npm workspaces,
// `cd tests/cross-app && npx vitest`, etc).
function findRepoRoot(start: string): string {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'hq')) && existsSync(join(dir, 'site'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`could not locate repo root (walked up from ${start})`)
    dir = parent
  }
}

export const REPO_ROOT = findRepoRoot(here)
export const HQ_ROOT = join(REPO_ROOT, 'hq')
export const SITE_ROOT = join(REPO_ROOT, 'site')

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  return dotenv.parse(readFileSync(path, 'utf8'))
}

// Base values only — process env is deliberately NOT merged in here. The
// wrappers (with-test-db.mjs) are what merge process.env over the file at
// boot time; this module only needs the base DATABASE_URL to derive the test
// DB URLs, so merging here would risk a stray ambient DATABASE_URL silently
// pointing the harness's own Prisma clients at the wrong database.
const hqEnv = parseEnvFile(join(HQ_ROOT, '.env.server'))
const siteEnv = parseEnvFile(join(SITE_ROOT, '.env.server'))

function deriveTestUrl(baseUrl: string | undefined, dbName: string, label: string): string {
  if (!baseUrl) throw new Error(`no DATABASE_URL found in ${label}/.env.server`)
  if (!dbName.endsWith('_test')) {
    throw new Error(`refusing to derive a test database URL: "${dbName}" does not end in "_test"`)
  }
  const u = new URL(baseUrl)
  u.hostname = '127.0.0.1' // pin the host — .env.server files may say "localhost"
  u.pathname = `/${dbName}`
  return u.toString()
}

export const HQ_TEST_DATABASE_URL = deriveTestUrl(hqEnv.DATABASE_URL, 'agenthix_test', 'hq')
export const SITE_TEST_DATABASE_URL = deriveTestUrl(siteEnv.DATABASE_URL, 'agenthix_site_test', 'site')

// A fresh temp dir per run, used as both apps' workspace/data root (SITE_ROOT)
// so the cross-app tier never touches a developer's real ~/.agenthix.dev data.
//
// vitest runs globalSetup and the test files in separate processes, and this
// module's mkdtemp side effect runs on every import — so without the env-var
// handoff below, each process mints its OWN temp dir, and only globalSetup's
// (the one apps.ts actually booted against) gets torn down; the test file's
// unused one leaks. globalSetup is always the first process to import this
// module (vitest calls it before spawning any worker for the test files), so
// it mints the real directory and republishes it via the env var; every
// later importer (the test-file worker) picks up the same path instead of
// minting its own.
export const SITE_ROOT_DIR =
  process.env.CROSSAPP_SITE_ROOT_DIR ?? mkdtempSync(join(tmpdir(), 'agenthix-crossapp-'))
process.env.CROSSAPP_SITE_ROOT_DIR = SITE_ROOT_DIR

// The site will not start without its own SECRETS_MASTER_KEY. A developer's
// site/.env.server normally has one (the pairing helper writes it) and CI may
// export one; when the environment the site's wrapper loads has neither, the
// harness supplies a throwaway key for this run — only in the spawned site's
// environment, never written to any file. One key per run, handed across
// processes the same way as SITE_ROOT_DIR above, so a site restarted mid-run
// can still read the credential it stored before the restart.
const loadedSiteKey = process.env.SECRETS_MASTER_KEY?.trim() || siteEnv.SECRETS_MASTER_KEY?.trim()
export const SITE_SECRETS_MASTER_KEY: string | undefined = loadedSiteKey
  ? undefined
  : (process.env.CROSSAPP_SITE_SECRETS_KEY ?? randomBytes(32).toString('base64'))
if (SITE_SECRETS_MASTER_KEY) process.env.CROSSAPP_SITE_SECRETS_KEY = SITE_SECRETS_MASTER_KEY

// What the host service sets at install for hq and its Fleet Console (host-management spec §4 C8). hq is always
// started with it here, so the stand-in Fleet Console (fleetConsole.ts) can dial hq in any file, after any restart.
// Fixed, 64 hex characters, and only ever used against the harness's own test databases.
export const CONSOLE_PAIRING_SECRET = 'feed0000'.repeat(8)

// hq's control socket, for the commands a machine admin runs on hq's machine (`fleet-admin`, …). Pinned under the
// run's temp dir: by default it sits in a folder named after hq's port, which a developer's hq on the same port uses.
export const HQ_CONTROL_SOCKET = join(SITE_ROOT_DIR, 'hq-control.sock')

// Three free ports, asked of the operating system once per run: hq's web page, hq's server and the site. Handed to
// the test-file workers by the environment, as SITE_ROOT_DIR is, so every process names the same ones.
const [hqClient, hqServer, siteServer] = process.env.CROSSAPP_PORTS
  ? process.env.CROSSAPP_PORTS.split(',').map(Number)
  : await freePorts(3)
process.env.CROSSAPP_PORTS = [hqClient, hqServer, siteServer].join(',')

export const PORTS = { hqClient, hqServer, siteServer } as const

export const HQ_URL = `http://localhost:${PORTS.hqServer}`
export const SITE_URL = `http://localhost:${PORTS.siteServer}`
