/**
 * The shutdown handlers' two halves, and the peer they have to get right.
 *
 * Its own file because `installShutdownHandlers` installs once per process and
 * each handler removes itself on the first delivery — so the two branches need
 * two signals, and the module needs to start unregistered, which only a
 * separate file gives.
 *
 * Both branches are driven with `process.emit`, which runs the listeners
 * exactly as a real delivery does without actually signalling anything, and
 * with `process.kill` spied so the re-raise can be observed instead of ending
 * the test run.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitDeadline, runGit } from '../gitRunner'

const execFileAsync = promisify(execFile)

/**
 * A `once` peer, registered BEFORE this module installs anything.
 *
 * `once` is the case the guard used to get wrong: node removes a `once`
 * listener at the moment it is invoked, so a handler running after one sees a
 * listener count of zero, concludes it is alone and re-raises — ending the
 * process on top of a graceful shutdown that had just started.
 */
const oncePeer = vi.fn()
const killSpy = vi.spyOn(process, 'kill')
let tmp: string

beforeAll(async () => {
  process.once('SIGINT', oncePeer)
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-shutdown-'))
  await execFileAsync('git', ['-C', tmp, 'init', '-q', '-b', 'main'])
  // Handlers install on the first spawn, not at import.
  await runGit(['-C', tmp, 'status', '--porcelain'], { deadline: new GitDeadline(30_000) })
  killSpy.mockImplementation(() => true)
})

afterAll(async () => {
  killSpy.mockRestore()
  process.removeListener('SIGINT', oncePeer)
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('where the handler sits in the queue', () => {
  /**
   * The whole fix for the `once` case. Running FIRST is what keeps every peer
   * — `once` or not — still registered at the moment the count is taken.
   */
  it('runs before a peer that registered first', () => {
    // `listeners`, not `rawListeners`: a `once` listener is stored as a
    // wrapper, and this is the accessor that unwraps it back to what was
    // registered.
    const listeners = process.listeners('SIGINT')
    expect(listeners.length).toBeGreaterThanOrEqual(2)
    expect(listeners[listeners.length - 1]).toBe(oncePeer)
    expect(listeners[0]).not.toBe(oncePeer)
  })

  it('has attached to every signal a shutdown arrives as, nodemon\'s restart included', () => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGUSR2'] as const) {
      expect(process.listenerCount(signal), `nothing listens for ${signal}`).toBeGreaterThan(0)
    }
  })
})

describe('when a peer is listening', () => {
  it('does not re-raise, and the peer still runs', () => {
    killSpy.mockClear()
    process.emit('SIGINT')

    // The peer ran: it was still queued when the handler took the count, which
    // is only true because the handler ran first.
    expect(oncePeer).toHaveBeenCalledTimes(1)
    // And nothing re-raised on top of it. A re-raise here ends the process
    // while the peer's own shutdown is still in flight.
    expect(killSpy.mock.calls.filter(([pid, sig]) => pid === process.pid && sig === 'SIGINT')).toHaveLength(0)
  })
})

describe('when nothing else is listening', () => {
  /**
   * The other half, and it is not optional: adding a listener suppresses
   * node's default action, so a site with no other handler would simply stop
   * dying on Ctrl-C.
   */
  it('removes itself and re-raises, so the process still dies', () => {
    killSpy.mockClear()
    expect(process.listenerCount('SIGHUP')).toBe(1)

    process.emit('SIGHUP')

    expect(process.listenerCount('SIGHUP')).toBe(0)
    expect(killSpy.mock.calls.filter(([pid, sig]) => pid === process.pid && sig === 'SIGHUP')).toHaveLength(1)
  })
})
