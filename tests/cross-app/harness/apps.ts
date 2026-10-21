// Process management for the two real apps the cross-app tier boots.
//
// Both apps run under their own scripts/test/with-test-db.mjs wrapper so
// they come up pointed at the isolated *_test databases (never dev data):
// hq via plain `wasp start` — NOT hq/scripts/dev/start.sh, which hard-exits
// without a Claude credentials file, builds Docker images, and kills ports —
// and site, a plain Node server, via `npm run dev`.
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import {
  HQ_CONTROL_SOCKET,
  HQ_ROOT,
  HQ_TEST_DATABASE_URL,
  HQ_URL,
  PORTS,
  CONSOLE_PAIRING_SECRET,
  SITE_ROOT,
  SITE_ROOT_DIR,
  SITE_SECRETS_MASTER_KEY,
  SITE_TEST_DATABASE_URL,
  SITE_URL,
} from './env'

type AppHandle = { child: ChildProcess; logPath: string }

let hqHandle: AppHandle | null = null
let siteHandle: AppHandle | null = null

// Cross-process PID handoff, same problem env.ts's SITE_ROOT_DIR env var
// solves for the temp dir: globalSetup.ts and the test-file workers run in
// separate Node processes (db.ts's own comment documents this), so a
// module-level `hqHandle`/`siteHandle` set by startHq()/startSite() in one
// process is simply absent in another. Without this, a suite that restarts
// hq mid-run (cross-app suite 01's reconnect scenario) calls stopHq() against
// an empty local handle — a silent no-op — while the real process spawned by
// globalSetup keeps running and holding the ports, so the immediately
// following startHq() then (correctly) refuses them as busy.
//
// The file is the single source of truth for "which OS process is currently
// running," always written on spawn and always read on stop — a local
// AppHandle is used only for its 'exit' event as a same-process optimization
// when its pid happens to match what the file says right now.
function pidFilePath(name: 'hq' | 'site'): string {
  return join(SITE_ROOT_DIR, `${name}.pid`)
}

function readPid(name: 'hq' | 'site'): number | null {
  try {
    const pid = Number(readFileSync(pidFilePath(name), 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function writePid(name: 'hq' | 'site', pid: number): void {
  mkdirSync(SITE_ROOT_DIR, { recursive: true })
  writeFileSync(pidFilePath(name), String(pid))
}

function clearPid(name: 'hq' | 'site'): void {
  try {
    unlinkSync(pidFilePath(name))
  } catch {
    // already gone
  }
}

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

function probePort(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ port, host })
    const done = (open: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolvePromise(open)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1000, () => done(false))
  })
}

/**
 * A busy 4100 is a real trap, not just noise: hq's vite auto-increments onto 4101
 * and steals the server port out from under wasp's own node server, so a
 * "readiness" wait against 4101 can end up talking to the wrong process
 * entirely. Refuse to spawn unless the ports the app about to start actually
 * needs are free.
 *
 * Scoped to the caller's own ports, not all four unconditionally: a suite
 * that restarts one app while deliberately leaving the other running (the
 * hq-restart-only reconnect scenario, cross-app suite 01) needs startHq() to
 * judge readiness only by hq's own ports — checking site's too would refuse
 * every such restart on the grounds that site (correctly) still holds them.
 */
export async function refuseIfBusy(ports: number[], label: string): Promise<void> {
  const busy = await Promise.all(ports.map((p) => probePort(p)))
  if (busy.some(Boolean)) {
    const listed = ports.filter((_, i) => busy[i]).join('/')
    throw new Error(
      `${label} port(s) must be free before starting — stop the dev server already using them. (busy: ${listed})`,
    )
  }
}

function tailLog(logPath: string, lines = 40): string {
  try {
    const content = readFileSync(logPath, 'utf8')
    return content.split('\n').slice(-lines).join('\n')
  } catch {
    return '(log file unavailable)'
  }
}

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
 *     URL db.ts's Prisma clients use) with any ambient TEST_DB_NAME deleted
 *     — otherwise the wrapper (which merges process.env over its file env)
 *     can derive a different test database than the one the harness itself
 *     is asserting against, if a developer's shell happens to export either.
 * `extraEnv` carries only the per-app additions (ports, URLs); `stripKeys`
 * deletes ambient values that would otherwise leak through undetected.
 */
const START_COMMAND: Record<'hq' | 'site', string[]> = {
  hq: ['npx', 'wasp', 'start'],
  site: ['npm', 'run', 'dev'],
}

function spawnApp(
  name: 'hq' | 'site',
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
    DATABASE_URL: name === 'hq' ? HQ_TEST_DATABASE_URL : SITE_TEST_DATABASE_URL,
  }
  // hq's own files, its log among them, go under the temp dir too: left to its
  // default they land in the checkout's hq/storage, beside a developer's HQ.
  if (name === 'hq') env.HQ_STORAGE_ROOT = join(SITE_ROOT_DIR, 'hq-storage')
  delete env.TEST_DB_NAME
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
  const child = spawn('node', ['scripts/test/with-test-db.mjs', ...START_COMMAND[name]], {
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
export type StartHqOptions = { pairingSecret?: string }
export type StartSiteOptions = { pairingSecret?: string; hqUrl?: string }

export async function startHq(options: StartHqOptions = {}): Promise<void> {
  await refuseIfBusy([PORTS.hqClient, PORTS.hqServer], 'hq')
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
  })
}

export async function startSite(options: StartSiteOptions = {}): Promise<void> {
  await refuseIfBusy([PORTS.siteServer], 'site')
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
      // Wasp was once observed binding hq's 4101 when PORT was left to merge
      // order.
      PORT: String(PORTS.siteServer),
      // Only when the loaded environment has no key of its own (env.ts).
      ...(SITE_SECRETS_MASTER_KEY ? { SECRETS_MASTER_KEY: SITE_SECRETS_MASTER_KEY } : {}),
    },
  )
}

async function stopHandle(name: 'hq' | 'site', handle: AppHandle | null, ports: number[]): Promise<void> {
  // The pid file is authoritative — it always names whichever process most
  // recently spawned this app, in any process. `handle` only helps when its
  // pid happens to still match: then its 'exit' event lets this resolve as
  // soon as the process actually dies instead of waiting out a fixed delay.
  const pid = readPid(name) ?? handle?.child.pid ?? null
  if (pid == null) return
  const localChild = handle && handle.child.pid === pid ? handle.child : null

  const alreadyExited = localChild ? localChild.exitCode !== null || localChild.signalCode !== null : false

  // Always attempt the group kill — even if the wrapper process itself
  // already exited (or was already marked killed), a surviving grandchild
  // (the actual server — hq's wasp/vite, site's node under tsx) can still hold the process group and the
  // listening ports open. ESRCH ("process group already gone") is the only
  // expected failure here.
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    // process group already gone
  }

  if (localChild && !alreadyExited) {
    // Same-process: wait for the real 'exit' event (bounded), escalating to
    // SIGKILL if SIGTERM alone doesn't land in time.
    const exited = new Promise<void>((resolvePromise) => {
      localChild.once('exit', () => resolvePromise())
    })
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), 10_000)),
    ])
    if (timedOut) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // already gone
      }
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))])
    }
  }
  // Cross-process (no localChild — this pid was spawned by a different
  // process, e.g. globalSetup while this call runs in a test-file worker):
  // there is no exit event to await here, so fall straight through to the
  // port-polling loop below, which re-checks every 250ms for up to 10s and
  // escalates to SIGKILL itself if the ports are still bound by then.

  // The wrapper's own process exiting doesn't guarantee the server's
  // listener sockets have actually unbound yet — poll until the ports are
  // free instead of resolving the moment the process group is gone, bounded
  // so a port that genuinely never frees can't hang teardown forever.
  const pollDeadline = Date.now() + 10_000
  while (Date.now() < pollDeadline) {
    const busy = await Promise.all(ports.map((p) => probePort(p)))
    if (!busy.some(Boolean)) {
      clearPid(name)
      return
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  // Still bound 10s later — escalate once more (same SIGKILL as above, in
  // case a grandchild reparented after the first one fired) and give the
  // kernel a last few seconds to release the sockets before giving up.
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // already gone
  }
  const finalDeadline = Date.now() + 5_000
  while (Date.now() < finalDeadline) {
    const busy = await Promise.all(ports.map((p) => probePort(p)))
    if (!busy.some(Boolean)) {
      clearPid(name)
      return
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  clearPid(name)
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
  await Promise.all([stopHq(), stopSite()])
}

async function pollUntilReady(check: () => Promise<boolean>, handle: AppHandle | null, label: string): Promise<void> {
  const timeoutMs = 360_000
  const intervalMs = 2_000
  const end = Date.now() + timeoutMs
  for (;;) {
    if (await check().catch(() => false)) return
    if (Date.now() > end) {
      const log = handle ? tailLog(handle.logPath) : '(no log — process handle missing)'
      const logPath = handle?.logPath ?? '(unknown)'
      throw new Error(
        `${label} did not become ready within ${timeoutMs / 1000}s.\nLog: ${logPath}\n--- last ${40} lines ---\n${log}`,
      )
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
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
}
