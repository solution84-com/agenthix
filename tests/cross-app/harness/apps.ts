// Process management for the two real apps the cross-app tier boots, and hq's relay beside them.
//
// Both apps run under their own scripts/test/with-test-db.mjs wrapper so
// they come up pointed at the isolated *_test databases (never dev data):
// hq from its compiled output (scripts/regression/hq-built.mjs: the server's
// bundle and Vite, as `wasp start` runs them, built once by globalSetup) — so
// two runs in one checkout never regenerate each other's `.wasp/out` — and NOT
// hq/scripts/dev/start.sh, which hard-exits without a Claude credentials file,
// builds Docker images, and kills ports; and site, a plain Node server, via `npm run dev`. hq's relay holds no database: it runs from its build
// (`relay/dist`, made by globalSetup), as scripts/dev/relay.sh runs it.
import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import {
  HQ_CONTROL_SOCKET,
  HQ_CLIENT_URL,
  HQ_ROOT,
  HQ_STORAGE_DIR,
  HQ_TEST_DATABASE_URL,
  HQ_URL,
  PORTS,
  CONSOLE_PAIRING_SECRET,
  RELAY_ROOT,
  RELAY_SECRET,
  REPO_ROOT,
  SITE_ROOT,
  SITE_ROOT_DIR,
  SITE_SECRETS_MASTER_KEY,
  SITE_TEST_DATABASE_URL,
  SITE_URL,
  TEST_DB_NAMES,
} from './env'
import { siteDb } from './db'
import { recordSiteId } from './siteLeftovers'
import { type AppHandle, type AppName, pollUntilReady, readPid, stopHandle, writePid } from './appProcess'

let hqHandle: AppHandle | null = null
let siteHandle: AppHandle | null = null
let relayHandle: AppHandle | null = null

// Armed only by globalSetup.ts (via markAsProcessOwner, below) — never by a
// test-file worker. Tightened while chasing a real cross-file hq death (plan
// 5f task 5 — see spawnApp's own comment below for the actual root cause that
// investigation found; this hook turned out not to be it, but the same
// investigation surfaced this as a real, separate latent bug worth closing
// while in here). apps.ts is imported into every process that touches this
// harness, globalSetup's own process AND each per-test-file worker alike
// (db.ts's own comment already documents this split for its Prisma clients).
// 01-registration.test.ts's restart scenario calls startHq()/startSite()
// itself mid-file to exercise a real restart — which sets
// hqHandle/siteHandle in THAT WORKER's own module state, not globalSetup's.
// Left unguarded, the exit-hook below would fire when that worker process
// wound down at the end of its own file — an ordinary, successful exit,
// nothing like the Ctrl-C case the hook exists for — and SIGKILL the very hq
// process 01 had just restarted, out from under every file that runs after
// it. Only globalSetup's process is ever responsible for these apps'
// full-run lifecycle (its own returned `cleanup` is what the harness
// actually relies on for orderly teardown — see globalSetup.ts), so only it
// should ever be allowed to fire this last-resort path.
let isProcessOwner = false
export function markAsProcessOwner(): void {
  isProcessOwner = true
}

// Last-resort orphan guard: vitest's own SIGINT handler calls process.exit()
// synchronously on Ctrl-C, which skips awaiting globalSetup's teardown (and
// detached children never receive the terminal's SIGINT directly, since
// spawnApp puts them in their own process group). 'exit' listeners DO still
// run during a synchronous process.exit(), so this is the only hook left
// that can reach the process groups before this process itself is gone —
// best-effort, synchronous, no async cleanup possible at this point.
process.on('exit', () => {
  if (!isProcessOwner) return
  for (const [name, handle] of [
    ['hq', hqHandle],
    ['site', siteHandle],
    ['relay', relayHandle],
  ] as const) {
    // F: the pid file is read FIRST, not the module-level handle — this
    // process's own hqHandle/siteHandle go stale the moment a worker
    // restarts an app mid-run (01-registration's hq-restart scenario spawns
    // a NEW child in a DIFFERENT process, per this module's own header
    // comment on the pid-file design), and by the time this hook fires on
    // Ctrl-C the handle here may name a pid that has already been recycled
    // by the OS for something unrelated. readPid() is a synchronous
    // readFileSync — safe to call from an 'exit' listener — so it always
    // reflects whichever process most recently spawned this app, in any
    // process; the handle's own pid is only a fallback for the case no pid
    // file exists at all (nothing was ever spawned).
    const pid = readPid(name) ?? handle?.child.pid
    if (pid == null) continue
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
})

/**
 * Shared spawn path for both apps. Builds the child env itself rather than
 * trusting the caller to assemble it, so the properties every child MUST
 * have can't be forgotten by one call site:
 *   - SITE_ROOT pinned to the hermetic temp dir, for site — its runtime reads
 *     it directly for workspaces, files homes and task directories. hq no
 *     longer reads SITE_ROOT at all (it reaches no disk but its own), so
 *     pinning it on hq's child here is inert; kept because this function
 *     assigns the same base env to both children rather than because hq
 *     needs it. The assets-tree symlink globalSetup.ts sets up under this
 *     temp dir predates that too — see its own note.
 *   - DATABASE_URL pinned to the harness's own *_TEST_DATABASE_URL (the same
 *     URL db.ts's Prisma clients use) and TEST_DB_NAME to the run's database
 *     name — otherwise the wrapper (which merges process.env over its file env)
 *     can derive a different test database than the one the harness itself
 *     is asserting against, if a developer's shell happens to export either.
 * `extraEnv` carries only the per-app additions (ports, URLs); `stripKeys`
 * deletes ambient values that would otherwise leak through undetected.
 */
const HQ_BUILT = join(REPO_ROOT, 'scripts', 'regression', 'hq-built.mjs')
const START_COMMAND: Record<AppName, string[]> = {
  hq: ['node', 'scripts/test/with-test-db.mjs', 'node', HQ_BUILT],
  site: ['node', 'scripts/test/with-test-db.mjs', 'npm', 'run', 'dev'],
  relay: ['node', '--enable-source-maps', 'dist/relay.js'],
}

function spawnApp(
  name: AppName,
  cwd: string,
  extraEnv: NodeJS.ProcessEnv,
  stripKeys: string[] = [],
): AppHandle {
  mkdirSync(SITE_ROOT_DIR, { recursive: true })
  const logPath = join(SITE_ROOT_DIR, `${name}.log`)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    SITE_ROOT: SITE_ROOT_DIR,
  }
  if (name !== 'relay') {
    env.DATABASE_URL = name === 'hq' ? HQ_TEST_DATABASE_URL : SITE_TEST_DATABASE_URL
    // The wrapper swaps the database name for TEST_DB_NAME: the run's own (runDatabases.ts), never an ambient one.
    env.TEST_DB_NAME = name === 'hq' ? TEST_DB_NAMES.hq : TEST_DB_NAMES.site
  }
  // hq's own files, its log among them, go under the temp dir too: left to its
  // default they land in the checkout's hq/storage, beside a developer's HQ.
  if (name === 'hq') env.HQ_STORAGE_ROOT = HQ_STORAGE_DIR
  if (name === 'relay') delete env.TEST_DB_NAME
  for (const key of stripKeys) delete env[key]

  // Raw fds, not `stdio: 'pipe'` + a `.pipe()`'d WriteStream (plan 5f task 5's
  // own debugging — see the report for the full trace): 'pipe' mode makes the
  // SPAWNING process the pipe's reader, so the log file only fills because
  // that process forwards bytes into it. This app is `detached: true` and
  // meant to keep running across test FILES, each of which gets its own
  // vitest fork worker (tinypool) — when 01-registration's worker (the
  // process that called startHq()/startSite() for a mid-file restart) is
  // torn down by tinypool at that file's own boundary, the pipe's read end
  // dies with it. `detached` only isolates signal delivery (process groups),
  // not file descriptors — it does nothing to protect against this. The next
  // time hq/site writes a log line (its own request logging fires on nearly
  // every HTTP call, including the harness's own polling), the write hits a
  // broken pipe; Node's default EPIPE handling on an unhandled synchronous
  // stdout write is an uncaught exception, which exits the process outright,
  // with nothing left able to write the crash message to the now-broken pipe
  // itself — hence no trace in the log and a symptom indistinguishable from
  // an external SIGKILL. Opening the log file's fd directly and handing it to
  // `stdio` ties the child's stdout/stderr to the FILE at the kernel level,
  // with no process in the middle to die — the child then survives its own
  // spawner's exit exactly as a detached, independent process is supposed to.
  const outFd = openSync(logPath, 'a')
  const errFd = openSync(logPath, 'a')
  const [command, ...args] = START_COMMAND[name]
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', outFd, errFd],
  })
  // The child's own fd table now holds its dup of these — this process's
  // copies are only needed to hand off at spawn time.
  closeSync(outFd)
  closeSync(errFd)
  if (child.pid != null) writePid(name, child.pid)

  // J: a spawn-level failure (e.g. ENOENT — 'node' or the cwd not found)
  // fires 'error' on the ChildProcess, not through stdio (there's no process
  // yet to write to the log fds above) — left unhandled, that is an uncaught
  // exception in whichever process called spawnApp, which is a much less
  // useful failure than the plain "didn't become ready" pollUntilReady
  // already reports. Logged to the log file (best-effort — the child may
  // never have opened its own fd table at all) and to this process's own
  // stderr, then left to fall through to the readiness timeout.
  child.on('error', (err) => {
    const line = `[harness] child process 'error' event for ${name}: ${err.stack ?? err.message}\n`
    try {
      appendFileSync(logPath, line)
    } catch {
      // best effort — log file may be unreachable too
    }
    console.error(line.trimEnd())
  })

  return { child, logPath }
}

/**
 * HQ_PAIRING_SECRET is blanked (empty string, not deleted) for both apps unless
 * a test asks for one. The developer's real hq/.env.server and site/.env.server
 * carry the secret once the pairing helper has run, and the wrapper merges
 * process.env OVER the file — an empty value here is what wins over the file
 * (a deleted key would let the file's secret through). Without this, every
 * suite that adds a site through the Fleet Console would find hq's default site
 * and the site paired with it, and would not be testing that at all.
 *
 * A site the Fleet Console added is started the same way as the default site:
 * the host service gives it hq's address and its credential in the same two
 * variables (host/src/compose/projects.ts), so `pairingSecret` here is that
 * credential.
 */
// `env` adds variables to the app's environment, last: a suite that needs an install setting (the demo's) passes it here.
export type StartHqOptions = { pairingSecret?: string; env?: NodeJS.ProcessEnv }
export type StartSiteOptions = { pairingSecret?: string; hqUrl?: string; env?: NodeJS.ProcessEnv }

export async function startHq(options: StartHqOptions = {}): Promise<void> {
  hqHandle = spawnApp('hq', HQ_ROOT, {
    HQ_PAIRING_SECRET: options.pairingSecret ?? '',
    HQ_CONSOLE_PAIRING_SECRET: CONSOLE_PAIRING_SECRET,
    HQ_CONTROL_SOCKET,
    // Registration redemption freezes hq's socket URL from this at redemption
    // time, so hq must boot with it set explicitly rather than relying on
    // whatever .env.server happens to say.
    WASP_SERVER_URL: HQ_URL,
    // PORT/WASP_WEB_CLIENT_URL pinned explicitly too (not just WASP_SERVER_URL)
    // — see the port-collision note on startSite() below for why relying on
    // .env.server's own values here is not safe under this harness.
    PORT: String(PORTS.hqServer),
    WASP_WEB_CLIENT_URL: `http://localhost:${PORTS.hqClient}`,
    // The web page's dev server (hq/vite.config.ts) takes its port and its proxy target from these, and the client
    // bundle its API address from REACT_APP_API_URL.
    HQ_WEB_PORT: String(PORTS.hqClient),
    HQ_SERVER_PORT: String(PORTS.hqServer),
    REACT_APP_API_URL: HQ_URL,
    // hq's relay, as scripts/dev/pair.sh and relay.sh wire it: the secret they share, the line hq tells a site to
    // dial (the relay itself: in development no hq-web routes it), the port Vite passes a ticket's path to, and no
    // files address of the developer's (hq on localhost answers on files.localhost).
    HQ_RELAY_SECRET: RELAY_SECRET,
    HQ_RELAY_LINE_URL: `ws://127.0.0.1:${PORTS.relay}/relay-line`,
    RELAY_SERVER_PORT: String(PORTS.relay),
    FILES_ORIGIN: '',
    ...options.env,
  })
}

/**
 * hq's relay, as the host service runs it beside hq: it dials hq-server with the shared secret, answers browsers on
 * files.localhost (hq's web page passes it `/t/` and `/relay/`), and reads hq's uploads from hq's storage folder. It
 * redials hq on its own when hq restarts, so it is started once for the run.
 */
export async function startRelay(): Promise<void> {
  // The relay looks for the folder once, at start: it must be there before then.
  mkdirSync(HQ_STORAGE_DIR, { recursive: true })
  relayHandle = spawnApp('relay', RELAY_ROOT, {
    RELAY_HQ_ADDRESS: HQ_URL,
    HQ_RELAY_SECRET: RELAY_SECRET,
    HQ_URL: HQ_CLIENT_URL,
    FILES_ORIGIN: '',
    RELAY_PORT: String(PORTS.relay),
    RELAY_LISTEN_HOST: '127.0.0.1',
    HQ_UPLOADS_ROOT: HQ_STORAGE_DIR,
  })
}

export async function stopRelay(): Promise<void> {
  await stopHandle('relay', relayHandle, [PORTS.relay])
  relayHandle = null
}

export async function waitForRelay(): Promise<void> {
  await pollUntilReady(async () => (await fetch(`http://127.0.0.1:${PORTS.relay}/health`, { signal: AbortSignal.timeout(5000) })).ok, relayHandle, 'relay')
}

export async function startSite(options: StartSiteOptions = {}): Promise<void> {
  if (options.pairingSecret && !options.hqUrl) {
    throw new Error('startSite: a pairingSecret needs the hqUrl the site should pair with')
  }
  siteHandle = spawnApp(
    'site',
    SITE_ROOT,
    {
      HQ_PAIRING_SECRET: options.pairingSecret ?? '',
      // Blanked (again: empty beats the file, a delete would not) unless the
      // test starts the site with a secret or credential. If a
      // developer's shell or site/.env.server carried an HQ_URL, it would
      // otherwise leak through and pair or auto-register this boot, breaking
      // the canary's "hq is null after truncate" assertion.
      HQ_URL: options.pairingSecret ? options.hqUrl : '',
      // Pinned explicitly rather than left to site/.env.server: the site binds
      // env.PORT (src/server/main.ts), and the environment wins over the file
      // (node's --env-file), so this is the port it listens on. A run under
      // Wasp was once observed binding hq's server port when PORT was left to merge
      // order.
      PORT: String(PORTS.siteServer),
      // Only when the loaded environment has no key of its own (env.ts).
      ...(SITE_SECRETS_MASTER_KEY ? { SECRETS_MASTER_KEY: SITE_SECRETS_MASTER_KEY } : {}),
      ...options.env,
    },
  )
}

export async function stopHq(): Promise<void> {
  await stopHandle('hq', hqHandle, [PORTS.hqClient, PORTS.hqServer])
  hqHandle = null
}

export async function stopSite(): Promise<void> {
  await stopHandle('site', siteHandle, [PORTS.siteServer])
  siteHandle = null
}

export async function stopAll(): Promise<void> {
  await Promise.all([stopHq(), stopSite(), stopRelay()])
}

export async function waitForHq(): Promise<void> {
  await pollUntilReady(async () => {
    const res = await fetch(`${HQ_URL}/health`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const body = await res.json()
    return body?.status === 'ok'
  }, hqHandle, 'hq')
}

export async function waitForSite(): Promise<void> {
  await pollUntilReady(async () => {
    const res = await fetch(`${SITE_URL}/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  }, siteHandle, 'site')
  // The id the site labels what it makes with, for teardown (siteLeftovers.ts).
  const config: { siteId: string } | null = await siteDb.siteConfig.findFirst({ select: { siteId: true } }).catch(() => null)
  if (config) recordSiteId(config.siteId)
}
