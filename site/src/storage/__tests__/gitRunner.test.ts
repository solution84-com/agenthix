/**
 * The deadline is enforced, and the kill is confirmed.
 *
 * This is the property the whole module exists for, so it is driven against a
 * real stalled git rather than a stub: a TCP server on loopback that accepts
 * the connection and then answers nothing, which is what a hung remote looks
 * like from git's side. No network, and deterministic.
 *
 * Two things are asserted separately on purpose:
 *
 *  1. What the module CLAIMS — `GitTimedOut.confirmedDead`.
 *  2. What the KERNEL says — `process.kill(-pgid, 0)` throwing `ESRCH`,
 *     checked from the test itself after the call has returned.
 *
 * Asserting only the first would pass for a module that set the flag and
 * signalled nothing; asserting only the second would not catch a module that
 * killed the process but reported the deadline as a clean stop. Both, or the
 * test is checking a variable rather than a process.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  GitCommandFailed,
  GitDeadline,
  GitMissing,
  GitTimedOut,
  liveGitProcessGroups,
  runGit,
  stopLiveGitGroupsSync,
} from '../gitRunner'

const execFileAsync = promisify(execFile)

let tmp: string
let dir: string
let stalled: net.Server
let stalledPort: number
const heldOpen: net.Socket[] = []
const savedPath = process.env.PATH

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-runner-'))
  dir = path.join(tmp, 'work')
  await fs.mkdir(dir)
  await execFileAsync('git', ['-C', dir, 'init', '-q', '-b', 'main'])

  // Accept, then say nothing at all. git connects and blocks on the read.
  stalled = net.createServer(socket => heldOpen.push(socket))
  await new Promise<void>(resolve => stalled.listen(0, '127.0.0.1', resolve))
  stalledPort = (stalled.address() as net.AddressInfo).port
})

afterEach(async () => {
  if (savedPath === undefined) delete process.env.PATH
  else process.env.PATH = savedPath
  for (const socket of heldOpen.splice(0)) socket.destroy()
  await new Promise<void>(resolve => stalled.close(() => resolve()))
  await fs.rm(tmp, { recursive: true, force: true })
})

/** Ask the kernel directly, rather than believing what the module reported. */
function groupIsGone(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return false
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

describe('a git that will not finish', () => {
  it('is stopped at the deadline, and the kernel confirms its process group has gone', async () => {
    const started = Date.now()
    const err = await runGit(['-C', dir, 'fetch', `http://127.0.0.1:${stalledPort}/repo.git`], {
      deadline: new GitDeadline(700),
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(GitTimedOut)
    const timedOut = err as GitTimedOut

    // It stopped at ITS deadline, not at git's own idea of how long to wait.
    expect(Date.now() - started).toBeLessThan(10_000)

    // What the module claims…
    expect(timedOut.confirmedDead).toBe(true)
    expect(timedOut.pid).toEqual(expect.any(Number))

    // …and what the kernel says, asked independently, after the call returned.
    // `git fetch` over http runs `git-remote-http`, which is the process
    // actually holding the socket — so this is a real check that the GROUP
    // went, not just its leader.
    expect(groupIsGone(timedOut.pid as number)).toBe(true)
  })

  it('does not start a command that has no budget left', async () => {
    const spent = new GitDeadline(0)
    const err = await runGit(['-C', dir, 'status'], { deadline: spent }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitTimedOut)
    expect((err as GitTimedOut).pid).toBeNull()
    expect((err as GitTimedOut).confirmedDead).toBe(true)
  })

  it('shares one budget across the commands of a call', async () => {
    const deadline = new GitDeadline(700)
    await runGit(['-C', dir, 'status', '--porcelain'], { deadline })
    const err = await runGit(['-C', dir, 'fetch', `http://127.0.0.1:${stalledPort}/repo.git`], { deadline }).catch(
      (e: unknown) => e,
    )
    // The second command inherits what the first left, rather than starting
    // its own clock — nine commands with a timeout each would add up well past
    // the budget hq is holding.
    expect(err).toBeInstanceOf(GitTimedOut)
  })
})

describe('what git said', () => {
  /**
   * `execFile`'s `maxBuffer` KILLS the child once its output passes a limit —
   * one megabyte by default, which an ordinary large `git show` passes. That
   * was the one thing the old path did kill, and it was the wrong thing.
   */
  it('caps what it retains from a chatty command without stopping the command', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024)
    await fs.writeFile(path.join(dir, 'big.txt'), big)
    await execFileAsync('git', ['-C', dir, 'add', '-A'])
    await execFileAsync('git', [
      '-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'big',
    ])

    const { stdout } = await runGit(['-C', dir, 'show', 'HEAD:big.txt'], { deadline: new GitDeadline(30_000) })

    expect(stdout.length).toBeLessThan(big.length)
    expect(stdout).toContain('further characters not retained')
  })

  it('carries a failing command\'s own output on the error', async () => {
    const err = await runGit(['-C', dir, 'checkout', 'no-such-branch'], {
      deadline: new GitDeadline(30_000),
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitCommandFailed)
    expect((err as GitCommandFailed).exitCode).not.toBe(0)
    expect((err as GitCommandFailed).stderr).toMatch(/no-such-branch/)
  })

  it('says a missing binary is a missing binary, not a failure of git\'s', async () => {
    process.env.PATH = path.join(tmp, 'no-binaries-here')
    const err = await runGit(['-C', dir, 'status'], { deadline: new GitDeadline(30_000) }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitMissing)
  })
})

/**
 * `detached` is what gives this module a process group to kill — and it is
 * also what takes git OUT of the site's own group, so a signal sent to the
 * site no longer reaches it. Before `detached`, Ctrl-C on the dev server hit
 * git too; after it, git reparents to init and runs on with the deadline timer
 * that would have stopped it gone along with the process that armed it.
 *
 * The site therefore has to reach them itself, and that is what these pin: the
 * registry knows what is live, the shutdown path empties it, and the handlers
 * are actually attached.
 */
describe('the site taking its git processes with it', () => {
  it('tracks a live group and forgets it again when the command ends', async () => {
    const before = liveGitProcessGroups().length
    const running = runGit(['-C', dir, 'fetch', `http://127.0.0.1:${stalledPort}/repo.git`], {
      deadline: new GitDeadline(600),
    }).catch(() => undefined)

    // Waited on rather than slept through: a fixed delay asserts that the spawn
    // took LESS than it, which is a property of the machine, not of the module.
    await vi.waitFor(
      () => expect(liveGitProcessGroups().length).toBe(before + 1),
      { timeout: 500, interval: 10 },
    )

    await running
    expect(liveGitProcessGroups().length).toBe(before)
  })

  it('kills every live group synchronously, which is what a shutdown can do', async () => {
    const running = runGit(['-C', dir, 'fetch', `http://127.0.0.1:${stalledPort}/repo.git`], {
      deadline: new GitDeadline(30_000),
    }).catch(() => undefined)
    // Same reason as above, and the live check is inside the wait rather than
    // after it: registration and a running process group are what the three
    // assertions below need, so they are what is waited for.
    await vi.waitFor(
      () => {
        const [live] = liveGitProcessGroups()
        expect(live).toEqual(expect.any(Number))
        expect(groupIsGone(live)).toBe(false)
      },
      { timeout: 5_000, interval: 10 },
    )

    const [pgid] = liveGitProcessGroups()
    expect(pgid).toEqual(expect.any(Number))
    expect(groupIsGone(pgid)).toBe(false)

    // No awaiting: a signal handler has no tick it can rely on.
    expect(stopLiveGitGroupsSync()).toBeGreaterThan(0)

    await running
    expect(groupIsGone(pgid)).toBe(true)
    expect(liveGitProcessGroups()).toEqual([])
  })

  it('has attached itself to the signals a shutdown actually arrives as', async () => {
    await runGit(['-C', dir, 'status', '--porcelain'], { deadline: new GitDeadline(30_000) })
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) {
      expect(process.listenerCount(signal), `nothing listens for ${signal}`).toBeGreaterThan(0)
    }
    expect(process.listenerCount('exit')).toBeGreaterThan(0)
  })
})
