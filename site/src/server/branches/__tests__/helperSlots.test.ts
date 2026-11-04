/**
 * No storm of requests starts more than a few commit helpers (live preview phase 2's proof: about 1,100 reads in a
 * minute once took Docker down), and identical reads asked together share one run.
 */
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { helperDeps, runHelper, type HelperDeps, type HelperSpec } from '../helperContainer'
import { HELPER_SLOTS, READ_SHARE_MS, Slots, __resetHelperSlotsForTests, sharedRead, wroteWorkspace } from '../helperSlots'

afterEach(() => { __resetHelperSlotsForTests(); vi.useRealTimers() })

/** A docker client that answers `{ ok: true }` when told to, and counts how many run at once. */
function fakeDocker() {
  const live: Array<() => void> = []
  let running = 0
  let most = 0
  let started = 0
  const spawnDocker = (): ChildProcess => {
    const child = new EventEmitter() as ChildProcess
    const stdout = new PassThrough()
    Object.assign(child, { stdout, stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true })
    running++
    started++
    most = Math.max(most, running)
    live.push(() => {
      running--
      stdout.end('{"ok":true}\n')
      setImmediate(() => child.emit('close', 0))
    })
    return child
  }
  return {
    spawnDocker, live,
    get most() { return most }, get started() { return started }, get running() { return running },
    finishAll() { while (live.length) live.shift()!() },
  }
}

function depsWith(docker: ReturnType<typeof fakeDocker>, slots = new Slots(HELPER_SLOTS)): HelperDeps {
  return {
    ...helperDeps, contained: () => true, spawnDocker: docker.spawnDocker, removeContainer: async () => null,
    nonce: () => 'n', protectionsProblem: async () => null, slots, folderThere: async () => true,
  }
}

const read: HelperSpec = { workspaceId: 'w1', ws: { dir: '/x/workspaces/w1', readOnly: true }, network: false, timeoutMs: 10_000 }
const tick = () => new Promise(r => setImmediate(r))

describe('the site-wide limit @SC-1729', () => {
  it('100 helpers asked at once start no more than the limit, and all finish in turn', async () => {
    const docker = fakeDocker()
    const deps = depsWith(docker)
    const all = Array.from({ length: 100 }, () => runHelper(read, { op: 'list' }, deps))
    await tick()
    expect(docker.started).toBe(HELPER_SLOTS)
    while (docker.started < 100 || docker.live.length) {
      docker.finishAll()
      await tick(); await tick()
    }
    const answers = await Promise.all(all)
    expect(answers.every(a => a.ok === true)).toBe(true)
    expect(docker.most).toBe(HELPER_SLOTS)
  })

  it('one still waiting after half its budget is refused busy, having started nothing', async () => {
    vi.useFakeTimers()
    const docker = fakeDocker()
    const deps = depsWith(docker, new Slots(1))
    const first = runHelper(read, { op: 'list' }, deps)
    const second = runHelper({ ...read, timeoutMs: 1_000 }, { op: 'list' }, deps)
    await vi.advanceTimersByTimeAsync(501)
    expect(await second).toEqual(expect.objectContaining({ refused: 'busy' }))
    expect(docker.started).toBe(1)
    docker.finishAll()
    await vi.advanceTimersByTimeAsync(1)
    expect((await first).ok).toBe(true)
  })

  it('a slot freed passes to the next in line', async () => {
    const slots = new Slots(1)
    const a = await slots.acquire(1_000)
    const b = slots.acquire(1_000)
    expect(slots.waiting).toBe(1)
    a!()
    a!()
    const releaseB = await b
    expect(slots.running).toBe(1)
    releaseB!()
    expect(slots.running).toBe(0)
  })
})

describe('identical reads share one run @SC-1729', () => {
  it('reads asked together, and within the share time, run once', async () => {
    let now = 1_000
    let runs = 0
    const work = async () => { runs++; return { n: runs } }
    const all = await Promise.all(Array.from({ length: 50 }, () => sharedRead('w1', 'list', work, () => now)))
    expect(runs).toBe(1)
    expect(all.every(a => a.n === 1)).toBe(true)
    now += READ_SHARE_MS - 1
    expect((await sharedRead('w1', 'list', work, () => now)).n).toBe(1)
    now += 1
    expect((await sharedRead('w1', 'list', work, () => now)).n).toBe(2)
  })

  it('a different read, or another workspace, is not shared', async () => {
    let runs = 0
    const work = async () => ++runs
    await Promise.all([sharedRead('w1', 'list', work), sharedRead('w1', 'versions', work), sharedRead('w2', 'list', work)])
    expect(runs).toBe(3)
  })

  it('a write to the workspace ends the sharing of what was read before it', async () => {
    let runs = 0
    const work = async () => ++runs
    expect(await sharedRead('w1', 'list', work)).toBe(1)
    wroteWorkspace('w1')
    expect(await sharedRead('w1', 'list', work)).toBe(2)
  })

  it('a failure is not shared once it came', async () => {
    let runs = 0
    const work = async () => { runs++; if (runs === 1) throw new Error('timed out'); return runs }
    await expect(sharedRead('w1', 'list', work)).rejects.toThrow('timed out')
    expect(await sharedRead('w1', 'list', work)).toBe(2)
  })

  it('a helper that writes the workspace moves its generation on', async () => {
    const docker = fakeDocker()
    const deps = depsWith(docker)
    let runs = 0
    const work = async () => ++runs
    await sharedRead('w1', 'list', work)
    const writing = runHelper({ ...read, ws: { dir: '/x/workspaces/w1', readOnly: false } }, { op: 'merge' }, deps)
    await tick()
    docker.finishAll()
    await writing
    expect(await sharedRead('w1', 'list', work)).toBe(2)
  })
})
