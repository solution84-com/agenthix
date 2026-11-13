// The processes of the apps apps.ts starts: which one runs (a pid file, read across processes), stopping one and
// waiting until its ports are free, and waiting until one is ready.
import { type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { SITE_ROOT_DIR } from './env'

export type AppHandle = { child: ChildProcess; logPath: string }
export type AppName = 'hq' | 'site' | 'relay'

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
function pidFilePath(name: AppName): string {
  return join(SITE_ROOT_DIR, `${name}.pid`)
}

export function readPid(name: AppName): number | null {
  try {
    const pid = Number(readFileSync(pidFilePath(name), 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

export function writePid(name: AppName, pid: number): void {
  mkdirSync(SITE_ROOT_DIR, { recursive: true })
  writeFileSync(pidFilePath(name), String(pid))
}

export function clearPid(name: AppName): void {
  try {
    unlinkSync(pidFilePath(name))
  } catch {
    // already gone
  }
}

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

function tailLog(logPath: string, lines = 40): string {
  try {
    const content = readFileSync(logPath, 'utf8')
    return content.split('\n').slice(-lines).join('\n')
  } catch {
    return '(log file unavailable)'
  }
}

export async function stopHandle(name: AppName, handle: AppHandle | null, ports: number[]): Promise<void> {
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

export async function pollUntilReady(check: () => Promise<boolean>, handle: AppHandle | null, label: string): Promise<void> {
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
