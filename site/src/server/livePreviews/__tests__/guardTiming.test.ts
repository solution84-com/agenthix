/**
 * The guard's timing (live preview spec section 6, *The guard*): it looks at each live preview every
 * `GUARD_CHECK_EVERY_MS` and on every Docker event for its containers, acts within `GUARD_ACT_WITHIN_MS` of finding
 * something, tells why, and tells hq it runs only while it can watch. Fake timers and a fake Docker: no Docker here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { isSiteFeatureOn } from '../../features/siteFeatures'
import {
  GUARD_ACT_WITHIN_MS, GUARD_CHECK_EVERY_MS, GUARD_REPORT_EVERY_MS,
  type GuardSignal, type LivePreviewGuardEvent, type LivePreviewGuardReportEvent,
} from '@agenthix/core'
import type { DockerEvent, InspectedContainer } from '../guard/guardDocker'
import type { LivePreviewTemplate } from '../container/template'

// The comparison against the template is the template tests'; here every container the site made matches its own.
vi.mock('../container/inspect', async importOriginal => ({
  ...(await importOriginal<typeof import('../container/inspect')>()),
  templateDifferences: () => [],
}))

const { LivePreviewGuard, EVENT_RESTARTS_PER_MINUTE, LINE_CHECK_EVERY_MS } = await import('../guard/guard')

const LP = 'lp1'
const OWN = 'lp-lp1'
const DOCKER_CALL_MS = 250

type Acted = { what: string; signal?: GuardSignal; at: number }

function container(id: string, name: string): InspectedContainer {
  return { id, name, running: true, paused: false, oomKilled: false, addresses: ['10.1.0.2'], raw: {} }
}

/** A look inside the container: `init`, its command, the look itself, and the ports given listening on every address. */
function snapshotOut(ports: number[]): string {
  const p = (pid: number, ppid: number, cmd: string) => [
    `P ${pid} (x) S ${ppid} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${pid}`, `C ${cmd}`,
    'U Uid: 1001 1001 1001 1001 Gid: 1001 1001 1001 1001 CapPrm: 0000000000000000 CapEff: 0000000000000000 NoNewPrivs: 1',
  ]
  const tcp = ports.map((port, i) => `${i}: 00000000:${port.toString(16).toUpperCase().padStart(4, '0')} 00000000:0000 0A`)
  return ['self 50', ...p(1, 0, 'init'), ...p(7, 1, 'tail'), ...p(50, 0, 'sh'), 'NET', 'sl local_address rem_address st', ...tcp, 'END'].join('\n')
}

function world() {
  const w = {
    containers: [container('c1', OWN)],
    ports: [] as number[],
    paused: false,
    /** Looks begun: each begins by listing the live preview's containers. */
    looks: 0,
    lookFails: false,
    acted: [] as Acted[],
    told: [] as LivePreviewGuardEvent[],
    reports: [] as LivePreviewGuardReportEvent[],
    resumed: [] as string[],
    onEvent: null as null | ((e: DockerEvent) => void),
    onEnd: null as null | ((why: string) => void),
  }
  const slow = () => new Promise<void>(r => setTimeout(r, DOCKER_CALL_MS))
  const act = (what: string, signal?: GuardSignal) => w.acted.push({ what, signal, at: Date.now() })
  const guard = new LivePreviewGuard({
    docker: {
      events: (onEvent, onEnd) => {
        w.onEvent = onEvent
        w.onEnd = onEnd
        return { stop: () => { w.onEvent = null } }
      },
      containerIds: async () => { w.looks += 1; await slow(); return w.containers.map(c => c.id) },
      inspect: async ids => { await slow(); return w.containers.filter(c => ids.includes(c.id)) },
      usage: async () => { await slow(); return [] },
      kill: async () => { await slow() },
    },
    template: () => ({ name: OWN, image: 'img', user: '1001:1001' }) as LivePreviewTemplate,
    helper: async () => {
      await slow()
      if (w.lookFails) throw new Error('the look timed out')
      return { exitCode: 0, stdout: snapshotOut(w.ports) }
    },
    activity: { spared: () => new Set(), registeredPorts: () => new Set(), siteExecGoing: () => false, busy: () => false },
    drops: async () => null,
    protectionsProblem: async () => null,
    now: () => Date.now(),
    actions: {
      pause: async (_id, _detail, signal) => { act('pause', signal); w.paused = true },
      stop: async (_id, _detail, signal) => { act('stop', signal) },
      killContainers: async () => { act('killContainers') },
      killProcesses: async () => { act('killProcesses') },
      stopApp: async () => true,
      tell: e => { w.told.push(e) },
      now: () => Date.now(),
    },
    watched: async id => ({ id, projectId: 'pr1', paused: w.paused }),
    isLive: async () => true,
    pauseForLineLoss: async () => {},
    resumeAfterLineLoss: async id => { w.resumed.push(id) },
    running: async () => [LP],
    stopForMemory: async () => {},
    hqLineUp: () => true,
    livePreviewOn: () => isSiteFeatureOn('livePreview'),
    report: e => { w.reports.push(e) },
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: h => clearInterval(h as ReturnType<typeof setInterval>),
  })
  const event = (action: string, containerId = 'c1', name = OWN): void =>
    w.onEvent?.({ action, containerId, name, livePreviewId: LP, at: Date.now() })
  return { w, guard, event }
}

/** Starts the guard and watches one live preview whose first look finds nothing. */
async function watching() {
  const t = world()
  t.guard.start()
  const watched = t.guard.watch({ id: LP, projectId: 'pr1', paused: false })
  await vi.advanceTimersByTimeAsync(DOCKER_CALL_MS * 8)
  await watched
  expect(t.w.looks).toBe(1)
  expect(t.w.acted).toEqual([])
  return t
}

const firstOf = (acted: Acted[], what: string) => acted.find(a => a.what === what)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

// Outside the feature's own group the live preview is off, as shipped (adr-0172).
describe('the guard while the live preview is off', () => {
  it('tells hq nothing and resumes nothing it paused for the line, until the live preview is on', async () => {
    const { w, guard } = world()
    guard.start()
    guard.markPausedForLine(LP)
    await vi.advanceTimersByTimeAsync(Math.max(GUARD_REPORT_EVERY_MS, LINE_CHECK_EVERY_MS) * 3)
    guard.reportNow()
    expect(w.reports).toEqual([])
    expect(w.resumed).toEqual([])
    guard.stop()
  })
})

withFeature('livePreview', () => {
  describe('the guard while the live preview is on', () => {
    it('resumes what it paused for the line once the line is up', async () => {
      const { w, guard } = world()
      guard.start()
      guard.markPausedForLine(LP)
      await vi.advanceTimersByTimeAsync(LINE_CHECK_EVERY_MS * 2)
      expect(w.resumed).toEqual([LP])
      expect(w.reports.length).toBeGreaterThan(0)
      guard.stop()
    })
  })

  describe("the guard's timing @SC-1748", () => {
    it('looks at each live preview it watches every 5 seconds', async () => {
      const { w, guard } = await watching()
      const startedAt = Date.now() - DOCKER_CALL_MS * 8
      // The first check falls 5 s after the guard started.
      await vi.advanceTimersByTimeAsync(startedAt + GUARD_CHECK_EVERY_MS - Date.now() - 1)
      expect(w.looks).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(w.looks).toBe(2)
      await vi.advanceTimersByTimeAsync(GUARD_CHECK_EVERY_MS * 3)
      expect(w.looks).toBe(5)
      guard.stop()
    })

    it('looks at once on a Docker event for its container, not at the next check', async () => {
      const { w, guard, event } = await watching()
      event('restart')
      await vi.advanceTimersByTimeAsync(0)
      expect(w.looks).toBe(2)
      guard.stop()
    })

    it('pauses within 2 seconds of the check that finds a port no app of it opened', async () => {
      const { w, guard } = await watching()
      const appeared = Date.now()
      w.ports = [4000]
      await vi.advanceTimersByTimeAsync(GUARD_CHECK_EVERY_MS + GUARD_ACT_WITHIN_MS)
      const paused = firstOf(w.acted, 'pause')
      expect(paused).toMatchObject({ signal: 'unexpectedPort' })
      expect(paused!.at - appeared).toBeLessThanOrEqual(GUARD_CHECK_EVERY_MS + GUARD_ACT_WITHIN_MS)
      expect(w.told[0]).toMatchObject({ livePreviewId: LP, projectId: 'pr1', signal: 'unexpectedPort', steps: ['paused', 'alerted'] })
      guard.stop()
    })

    it('stops it within 2 seconds of Docker telling of a container it did not start, killing its containers first', async () => {
      const { w, guard, event } = await watching()
      const appeared = Date.now()
      w.containers.push(container('c9', 'stranger'))
      event('create', 'c9', 'stranger')
      await vi.advanceTimersByTimeAsync(GUARD_ACT_WITHIN_MS)
      const killed = firstOf(w.acted, 'killContainers')
      expect(killed).toBeDefined()
      expect(killed!.at - appeared).toBeLessThanOrEqual(GUARD_ACT_WITHIN_MS)
      expect(w.acted.map(a => a.what)).toEqual(['killContainers', 'stop'])
      expect(firstOf(w.acted, 'stop')).toMatchObject({ signal: 'notMadeBySite' })
      expect(w.told[0]).toMatchObject({ livePreviewId: LP, signal: 'notMadeBySite', steps: ['previewStopped', 'alerted'] })
      guard.stop()
    })

    it('stops it at once on a command run in its container that the site did not run', async () => {
      const { w, guard, event } = await watching()
      const ran = Date.now()
      event('exec_start: sh -c curl http://10.0.0.1')
      await vi.advanceTimersByTimeAsync(0)
      expect(w.acted.map(a => a.what)).toEqual(['killContainers', 'stop'])
      expect(firstOf(w.acted, 'killContainers')!.at - ran).toBeLessThanOrEqual(GUARD_ACT_WITHIN_MS)
      guard.stop()
    })

    it('stops a live preview it cannot look at, by the third check', async () => {
      const { w, guard } = await watching()
      w.lookFails = true
      await vi.advanceTimersByTimeAsync(GUARD_CHECK_EVERY_MS * 3 + GUARD_ACT_WITHIN_MS)
      expect(firstOf(w.acted, 'stop')).toMatchObject({ signal: 'guardDown' })
      guard.stop()
    })
  })

  describe('the guard telling hq it runs @SC-1748', () => {
    it('tells hq every 15 seconds while it can watch, naming what it watches', async () => {
      const { w, guard } = await watching()
      const before = w.reports.length
      await vi.advanceTimersByTimeAsync(GUARD_REPORT_EVERY_MS * 4)
      expect(w.reports.length - before).toBe(4)
      expect(w.reports.at(-1)).toMatchObject({ livePreviewIds: [LP] })
      guard.stop()
    })

    it("stops telling once it cannot keep Docker's events, stops what it watches, and watches nothing new", async () => {
      const { w, guard } = await watching()
      for (let i = 0; i <= EVENT_RESTARTS_PER_MINUTE; i++) {
        w.onEnd?.('docker went away')
        await vi.advanceTimersByTimeAsync(DOCKER_CALL_MS * 8)
      }
      expect(guard.healthy).toBe(false)
      expect(w.acted.some(a => a.what === 'stop' && a.signal === 'guardDown')).toBe(true)
      const reported = w.reports.length
      await vi.advanceTimersByTimeAsync(GUARD_REPORT_EVERY_MS * 5)
      expect(w.reports.length).toBe(reported)
      await expect(guard.watch({ id: 'lp2', projectId: 'pr1', paused: false })).rejects.toThrow(/not running/)
      guard.stop()
    })
  })
})
