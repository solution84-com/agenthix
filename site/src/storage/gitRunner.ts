/**
 * Running git with a deadline that is actually enforced, and a kill that is
 * actually confirmed.
 *
 * ## Why this exists rather than `promisify(execFile)`
 *
 * The control channel has no cancel frame. When hq's `repo.connect` request
 * times out, hq rejects its caller and deletes the pending entry — and the
 * site hears nothing at all. Anything it started keeps running: still writing
 * into the location's files after hq has reported the call as failed, still
 * there when a retry starts a second `git init`/`fetch`/`checkout` in the same
 * directory, and still there when a later run mounts that directory. An
 * abandoned operation reaching a later run is the real cost.
 *
 * So the deadline is enforced HERE, under a budget shorter than hq's
 * (`REPO_CONNECT_SITE_BUDGET_MS` against `REPO_CONNECT_TIMEOUT_MS`), and the
 * call fails with something it can say rather than leaving hq to infer a cause
 * from silence.
 *
 * ## A signal is not a death
 *
 * Signalling and moving on is the same abandonment with extra steps, so at the
 * deadline this module hands the whole process GROUP to
 * `./gitProcessGroup.ts`, which terminates it, kills it, and then keeps asking
 * the kernel until it says there is no such group. Only a confirmed answer is
 * reported as a stop — and the unconfirmed one reaches hq as its own code, so
 * the case where something may still be running is never the case everyone is
 * told is finished.
 *
 * That module also owns the other half of `detached`: the flag that gives us a
 * killable group is the same flag that takes git out of the SITE's group, so a
 * signal to the site stops reaching it. Its header has that in full.
 *
 * ## Output is capped, never fatal
 *
 * `execFile`'s `maxBuffer` KILLS the child when its output passes a limit — a
 * megabyte by default, which an ordinary clone of a large repository passes.
 * That is the one thing in the old path that did get killed, and it was the
 * wrong thing. Here the stream is always drained and only what is RETAINED is
 * bounded, so a chatty git finishes its work and the log keeps the head and
 * the tail of what it said.
 */
import { spawn } from 'node:child_process'
import { forgetGroup, installShutdownHandlers, registerGroup, stopGroup, wait } from './gitProcessGroup'

export { liveGitProcessGroups, stopLiveGitGroupsSync } from './gitProcessGroup'

/** Per call, not per command: nine git invocations share one budget. */
export class GitDeadline {
  private readonly at: number

  /**
   * A budget that is not a finite number THROWS rather than being carried.
   *
   * It would otherwise make `remainingMs()` `NaN`, which is not less than or
   * equal to zero — so the guard below waves it through — and then
   * `setTimeout(…, NaN)` fires on the next tick. Every git command would be
   * reported as having run past a budget it never had. The budget is always
   * one of this repository's own constants, so a bad one is a programming
   * error and deserves to say so.
   */
  constructor(totalMs: number) {
    if (!Number.isFinite(totalMs) || totalMs < 0) {
      throw new Error(`A git budget must be a non-negative number of milliseconds; received ${String(totalMs)}`)
    }
    this.at = Date.now() + totalMs
  }

  remainingMs(): number {
    return this.at - Date.now()
  }
}

/** git ran and exited non-zero. `stdout`/`stderr` are what it said, capped. */
export class GitCommandFailed extends Error {
  constructor(
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} exited with ${signal ? `signal ${signal}` : `code ${exitCode}`}`)
    this.name = 'GitCommandFailed'
  }
}

/** Nothing on PATH answers to `git`. Distinct from any failure git itself reports. */
export class GitMissing extends Error {
  constructor(readonly cause: NodeJS.ErrnoException) {
    super('no git binary is on this process\'s PATH')
    this.name = 'GitMissing'
  }
}

/**
 * The budget ran out. `confirmedDead` is the load-bearing field: false means
 * the kernel would not confirm the process group had gone, which is an
 * operational problem on this machine and not merely a slow git.
 */
export class GitTimedOut extends Error {
  constructor(
    readonly args: readonly string[],
    readonly pid: number | null,
    readonly confirmedDead: boolean,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(
      `git ${args.join(' ')} ran past this call's budget and was stopped` +
        (confirmedDead ? '' : ' — but the kernel would not confirm its process group had gone'),
    )
    this.name = 'GitTimedOut'
  }
}

/**
 * How long to let the `close` event land after the group has gone, so node
 * reaps the child: a zombie has not gone as far as signal 0 is concerned.
 */
const REAP_CLOSE_WAIT_MS = 200

/**
 * What one command's output may occupy in memory. Generous — this is a log
 * line's worth of context, not a transfer — and never a reason to stop git.
 */
const RETAINED_OUTPUT_BYTES = 256 * 1024

/** Keeps the head of a stream and says what it dropped. Draining never stops. */
class CappedOutput {
  private text = ''
  private dropped = 0

  add(chunk: string): void {
    const room = RETAINED_OUTPUT_BYTES - this.text.length
    if (room <= 0) {
      this.dropped += chunk.length
      return
    }
    this.text += chunk.slice(0, room)
    this.dropped += Math.max(0, chunk.length - room)
  }

  toString(): string {
    return this.dropped > 0 ? `${this.text}\n… ${this.dropped} further characters not retained` : this.text
  }
}

export interface RunGitOptions {
  /** The whole call's budget. A command started with none left fails immediately. */
  deadline: GitDeadline
  env?: NodeJS.ProcessEnv
}

/**
 * Run one git command to completion, or stop it and prove it stopped.
 *
 * Rejects with `GitMissing`, `GitTimedOut` or `GitCommandFailed` — three
 * distinct things the caller reports differently, rather than one errno to
 * pattern-match.
 */
export async function runGit(args: string[], opts: RunGitOptions): Promise<{ stdout: string; stderr: string }> {
  const remaining = opts.deadline.remainingMs()
  if (remaining <= 0) {
    throw new GitTimedOut(args, null, true, '', '')
  }

  installShutdownHandlers()
  const child = spawn('git', args, {
    env: opts.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so one signal reaches git AND the helper that is
    // actually holding the stalled connection — and so a signal to the SITE
    // does not, which is what the registry above exists to make up for.
    detached: true,
  })
  if (child.pid) registerGroup(child.pid)

  const stdout = new CappedOutput()
  const stderr = new CappedOutput()
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => stdout.add(chunk))
  child.stderr.on('data', (chunk: string) => stderr.add(chunk))

  type Ended = { kind: 'close'; code: number | null; signal: NodeJS.Signals | null } | { kind: 'error'; err: Error }
  const ended = new Promise<Ended>(resolve => {
    child.once('error', err => resolve({ kind: 'error', err }))
    // `close`, not `exit`: the streams are drained by then, so nothing git
    // said is lost to a race with its own exit.
    child.once('close', (code, signal) => resolve({ kind: 'close', code, signal }))
  })
  const exited = ended.then(() => undefined)
  void ended.then(() => {
    if (child.pid) forgetGroup(child.pid)
  })

  const deadlineHit = new Promise<'deadline'>(resolve => {
    const t = setTimeout(() => resolve('deadline'), opts.deadline.remainingMs())
    t.unref?.()
    void exited.then(() => clearTimeout(t))
  })

  const outcome = await Promise.race([ended, deadlineHit])

  if (outcome === 'deadline') {
    // `child.pid` IS the group id, because the child leads its own group.
    const confirmedDead = child.pid ? await stopGroup(child.pid, exited) : true
    // Let the close event land so node reaps the process: a zombie has not
    // gone as far as signal 0 is concerned, and would be reported as alive.
    await Promise.race([exited, wait(REAP_CLOSE_WAIT_MS)])
    throw new GitTimedOut(args, child.pid ?? null, confirmedDead, stdout.toString(), stderr.toString())
  }

  if (outcome.kind === 'error') {
    const errno = outcome.err as NodeJS.ErrnoException
    if (errno.code === 'ENOENT') throw new GitMissing(errno)
    throw errno
  }
  if (outcome.code !== 0) {
    throw new GitCommandFailed(args, outcome.code, outcome.signal, stdout.toString(), stderr.toString())
  }
  return { stdout: stdout.toString(), stderr: stderr.toString() }
}
