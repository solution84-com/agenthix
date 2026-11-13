// The machine the regression shares: the lock heavy commands take one at a time when other work runs beside it (the
// same folder lock other tools on this machine take), and free memory, which a group waits for before it starts.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

// The machine's one heavy lock, shared by every repository and worktree on it (the maintainers' heavy.sh takes the same
// one, with the same files): HEAVY_LOCK moves it. A run started under a holder that exported HEAVY_LOCK_HELD with this
// path is inside that holder's claim, and takes nothing.
export const HEAVY_LOCK = process.env.HEAVY_LOCK || '/tmp/machine-heavy.lock'
export const heldByParent = (path = HEAVY_LOCK, env = process.env) => env.HEAVY_LOCK_HELD === path

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

const readFile = (path, name) => {
  try {
    return readFileSync(join(path, name), 'utf8').trim()
  } catch {
    return ''
  }
}

/** Who holds the lock, from the files in its folder: { pid, repo, what, since }. */
export function readLockHolder(path = HEAVY_LOCK) {
  const pid = Number(readFile(path, 'pid'))
  return { pid: Number.isInteger(pid) && pid > 0 ? pid : null, repo: readFile(path, 'repo'), what: readFile(path, 'what'), since: readFile(path, 'since') }
}

export const holderLine = (h) => `held by pid ${h.pid ?? ''} — ${h.repo}: ${h.what}, since ${h.since}`

const pad = (n) => String(n).padStart(2, '0')
const localTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

/**
 * Takes the lock: a folder made atomically, holding `pid`, `repo`, `what` and `since`. Waits while a live process holds
 * it, saying who once a minute; clears one whose holder died. `whole` (a run that plans its own parallelism, as
 * `heavy --whole` is) also writes the empty file `whole`, which lets light commands (`heavy --light`) run beside it in
 * its shared slots, `light/<n>/pid`.
 */
export async function takeLock(path = HEAVY_LOCK, pid = process.pid, waitMs = 3000, { what = '', repo = basename(process.cwd()), say = () => {}, whole = false } = {}) {
  let polls = 0
  for (;;) {
    try {
      mkdirSync(path)
      writeFileSync(join(path, 'pid'), `${pid}\n`)
      writeFileSync(join(path, 'repo'), `${repo}\n`)
      writeFileSync(join(path, 'what'), `${what.slice(0, 120)}\n`)
      writeFileSync(join(path, 'since'), `${localTime(new Date())}\n`)
      if (whole) writeFileSync(join(path, 'whole'), '')
      return
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      const holder = readLockHolder(path)
      if (holder.pid && !alive(holder.pid)) {
        rmSync(path, { recursive: true, force: true })
        continue
      }
      if (polls % 20 === 0) say(`waiting — the machine's heavy lock is ${holderLine(holder)}`)
      polls++
      await sleep(waitMs)
    }
  }
}

export function releaseLock(path = HEAVY_LOCK, pid = process.pid) {
  try {
    if (Number(readFileSync(join(path, 'pid'), 'utf8').trim()) === pid) rmSync(path, { recursive: true, force: true })
  } catch { /* already gone */ }
}

/** How many light commands run beside the holder now: the shared slots whose process is alive. */
export function lightSlotsInUse(path = HEAVY_LOCK) {
  let slots
  try {
    slots = readdirSync(join(path, 'light'))
  } catch {
    return 0
  }
  return slots.filter((n) => {
    const pid = Number(readFile(join(path, 'light', n), 'pid'))
    return Number.isInteger(pid) && pid > 0 && alive(pid)
  }).length
}

/**
 * Publishes how many light commands may run beside the holder: `light-allowed` in the lock folder, a bare number,
 * written whole (a temporary file renamed over it) so heavy.sh never reads half of it.
 */
export function writeLightAllowed(path, allowed) {
  const tmp = join(path, `.light-allowed.${process.pid}`)
  try {
    writeFileSync(tmp, `${allowed}\n`)
    renameSync(tmp, join(path, 'light-allowed'))
  } catch {
    rmSync(tmp, { force: true })
  }
}

/** Asks macOS's Spotlight not to index a folder the run writes into while it runs. */
export function markNeverIndexed(dir) {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.metadata_never_index'), '')
  } catch { /* indexing only costs time */ }
}

/** The free memory percentage `memory_pressure -Q` reports on macOS, or MemAvailable's share of /proc/meminfo. */
export function parseFreeMemory(text) {
  const mac = /free percentage:\s*(\d+)%/i.exec(text)
  if (mac) return Number(mac[1])
  const total = /MemTotal:\s+(\d+)/.exec(text)
  const available = /MemAvailable:\s+(\d+)/.exec(text)
  if (total && available) return Math.round((Number(available[1]) / Number(total[1])) * 100)
  return null
}

export function freeMemoryPercent() {
  try {
    if (process.platform === 'darwin') return parseFreeMemory(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))
    return parseFreeMemory(readFileSync('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
}

/** Swap in use, in megabytes: `vm.swapusage` on macOS, SwapTotal less SwapFree from /proc/meminfo. */
export function parseSwapUsedMb(text) {
  const mac = /used = ([\d.]+)M/.exec(text)
  if (mac) return Number(mac[1])
  const total = /SwapTotal:\s+(\d+)/.exec(text)
  const free = /SwapFree:\s+(\d+)/.exec(text)
  if (total && free) return Math.round((Number(total[1]) - Number(free[1])) / 1024)
  return null
}

export function swapUsedMb() {
  try {
    if (process.platform === 'darwin') return parseSwapUsedMb(execFileSync('sysctl', ['vm.swapusage'], { encoding: 'utf8' }))
    return parseSwapUsedMb(readFileSync('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
}

/**
 * Waits before a step while free memory is under `holdUnder` or swap grew since the last reading (guard.mjs), saying
 * why every few minutes. Never gives up and starts anyway. Returns 'go', or 'abort' when free memory is under a tenth.
 */
export async function waitForMemory(holdUnder, { read = freeMemoryPercent, swap = swapUsedMb, say = console.log, everyMs = 10_000 } = {}) {
  const { memoryVerdict } = await import('./guard.mjs')
  let lastSaid = 0
  let before = swap()
  for (;;) {
    await sleep(Math.min(everyMs, 2000))
    const free = read()
    const now = swap()
    const verdict = memoryVerdict({ free, swapNow: now, swapBefore: before, holdUnder })
    before = now
    if (verdict !== 'hold') return verdict
    if (Date.now() - lastSaid > 5 * 60_000) {
      say(`waiting: free memory ${free}%${free !== null && free < holdUnder ? `, under ${holdUnder}%` : ', and swap is growing'}`)
      lastSaid = Date.now()
    }
    await sleep(everyMs)
  }
}

/** At most `limit` of the functions given to it run at once; the rest wait their turn. */
export function limiter(limit) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= limit || queue.length === 0) return
    active++
    const { fn, done, fail } = queue.shift()
    fn().then(done, fail).finally(() => { active--; next() })
  }
  return (fn) => new Promise((done, fail) => { queue.push({ fn, done, fail }); next() })
}

export const defaultLogs = () => join(tmpdir(), `agenthix-regression-${new Date().toISOString().replace(/[:.]/g, '-')}`)
