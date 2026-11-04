/** The numbers and checks that decide what runs in a live preview, pinned by example (F-site-17-08). */
import { describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { GUARD_BLOCKED_PER_MINUTE } from '@agenthix/core'
import { budgetLeft, budgetTmpfs, splitBudget, type LivePreviewBudget } from '../container/budget'
import { cwdInside, launcherExecArgs } from '../container/exec'
import { BlockedWindow, UsagePattern, UNUSUAL_CPU_FLOOR_PERCENT } from '../guard/rates'
import { imageBaseName, NOBODY, serviceBudget, serviceUser } from '../services/serviceUser'
import type { ServiceImage } from '../services/serviceTemplate'

const MIB = 1024 ** 2
const total: LivePreviewBudget = { memoryBytes: 4096 * MIB, cpus: 2, pids: 1000, diskBytes: 1280 * MIB, imageBytes: 8192 * MIB, logBytes: 30 * MIB }
const image = (user: string): ServiceImage => ({ id: 'i', size: 1, user, env: [], cmd: null, entrypoint: null, volumes: [], healthcheck: null }) as unknown as ServiceImage

withFeature('livePreview', () => {
  describe('who a service runs as', () => {
    it('names the registry-free base of an image', () => {
      expect(imageBaseName('docker.io/library/postgres:16')).toBe('postgres')
      expect(imageBaseName('redis@sha256:abc')).toBe('redis')
      expect(imageBaseName('ghcr.io/o/mongo')).toBe('mongo')
    })

    const passwd = 'root:x:0:0:::\npostgres:x:70:70:::\nnobody:x:65534:65534:::\n'
    it('keeps the image\'s own non-root user, by number', () => {
      expect(serviceUser(image('999:998'), 'x:1', null)).toBe('999:998')
      expect(serviceUser(image('postgres'), 'x:1', passwd)).toBe('70:70')
    })

    it('never gives root, however it is written, and falls back to the user named after the image, then nobody', () => {
      for (const root of ['', 'root', '0', '00', '0000:0']) expect(serviceUser(image(root), 'postgres:16', passwd)).toBe('70:70')
      expect(serviceUser(image('0'), 'unknown:1', passwd)).toBe(NOBODY)
      expect(serviceUser(image('1000:0'), 'unknown:1', null)).toBe('1000:65534')
    })
  })

  describe('a service\'s part of the budget', () => {
    it('is an even part of the pool for each declared service, never more than is left', () => {
      const { services } = splitBudget(total)
      const one = serviceBudget(services, 2, [])!
      expect(one.memoryBytes).toBe(Math.floor(services.memoryBytes / 2))
      const left = serviceBudget(services, 2, [one, one])
      expect(left).toBeNull()
    })
  })

  describe('the live preview\'s budget', () => {
    it('splits so the two parts together never exceed the whole', () => {
      const { own, services } = splitBudget(total)
      expect(own.memoryBytes + services.memoryBytes).toBe(total.memoryBytes)
      expect(own.pids + services.pids).toBe(total.pids)
      expect(own.diskBytes + services.diskBytes).toBe(total.diskBytes)
    })

    it('answers null once any part is spent, and what remains otherwise', () => {
      expect(budgetLeft(total, [total])).toBeNull()
      expect(budgetLeft(total, [{ ...total, memoryBytes: total.memoryBytes / 2 }, { ...total, memoryBytes: 0, cpus: 0, pids: 0, diskBytes: 0, logBytes: 0 }])).toBeNull()
      const left = budgetLeft(total, [{ ...total, memoryBytes: 1024 * MIB, cpus: 0.5, pids: 100, diskBytes: 100 * MIB, logBytes: 1 * MIB }])
      expect(left).toMatchObject({ memoryBytes: 3072 * MIB, cpus: 1.5, pids: 900, imageBytes: total.imageBytes })
    })

    it('sizes the two memory-backed folders from the disk budget: four fifths for /tmp', () => {
      const t = budgetTmpfs(total)
      const sizes = Object.values(t).map(v => Number(/size=(\d+)/.exec(v)![1]))
      expect(sizes[0]).toBe(Math.floor((total.diskBytes * 4) / 5))
      expect(sizes[0]! + sizes[1]!).toBe(total.diskBytes)
    })
  })

  describe('where a command may work', () => {
    it('is inside the copy\'s root, normalised, and nowhere else', () => {
      expect(cwdInside('/p/c', '/p/c')).toBe('/p/c')
      expect(cwdInside('/p/c', '/p/c/web/../app')).toBe('/p/c/app')
      expect(cwdInside('/p/c', '/p/c/../x')).toBeNull()
      expect(cwdInside('/p/c', '/p/cx')).toBeNull()
      expect(cwdInside('/p/c', 'web')).toBeNull()
      expect(cwdInside('/p/c', '/p/c/a\0b')).toBeNull()
    })

    it('puts the launcher before the program and the environment by name only', () => {
      const args = launcherExecArgs('cid', '/p/c', ['npm', 'run', 'dev'], { cwd: '/p/c/web', env: { NODE_ENV: 'development' } })
      expect(args.slice(0, 2)).toEqual(['exec', '-u'])
      expect(args).toContain('-e')
      expect(args).toContain('NODE_ENV')
      expect(args.join(' ')).not.toContain('development')
      expect(args.slice(-3)).toEqual(['npm', 'run', 'dev'])
    })

    it('refuses an environment variable that would choose which docker runs (F-site-17-07)', () => {
      for (const name of ['PATH', 'DOCKER_HOST', 'DOCKER_CONFIG', 'LD_PRELOAD']) {
        expect(() => launcherExecArgs('cid', '/p/c', ['ls'], { cwd: '/p/c', env: { [name]: 'x' } })).toThrow(/Refusing the environment variable/)
      }
    })
  })

  describe('the guard\'s rates', () => {
    it('counts blocked addresses over a minute, and starts over when the totals fall', () => {
      const w = new BlockedWindow()
      const drop = (dropped: number) => [{ source: 'a1', dropped }] as never
      expect(w.add(drop(0), ['a1'], 0)).toBe(false)
      expect(w.add(drop(GUARD_BLOCKED_PER_MINUTE), ['a1'], 10_000)).toBe(false)
      expect(w.add(drop(GUARD_BLOCKED_PER_MINUTE + 1), ['a1'], 20_000)).toBe(true)
      // The rules were applied again: counting starts over.
      expect(w.add(drop(1), ['a1'], 30_000)).toBe(false)
      // Another agent's drops are not this live preview's.
      expect(w.add([{ source: 'other', dropped: 999 }] as never, ['a1'], 40_000)).toBe(false)
    })

    it('calls use unusual only on two looks in a row, never while a run is active', () => {
      const u = new UsagePattern()
      const hot = [{ containerId: 'c', cpuPercent: UNUSUAL_CPU_FLOOR_PERCENT + 40, memoryBytes: 0, netBytes: 0 }]
      expect(u.add(hot, 0, true)).toEqual({ unusual: false })
      expect(u.add(hot, 1000, false)).toEqual({ unusual: false })
      expect(u.add(hot, 2000, false)).toEqual({ unusual: false })
    })

    it('finds use far above anything seen while working, on the second look', () => {
      const u = new UsagePattern()
      const busy = [{ containerId: 'c', cpuPercent: 10, memoryBytes: 0, netBytes: 0 }]
      u.add(busy, 0, true)
      const hot = [{ containerId: 'c', cpuPercent: 90, memoryBytes: 0, netBytes: 0 }]
      expect(u.add(hot, 1000, false)).toEqual({ unusual: false })
      expect(u.add(hot, 2000, false)).toEqual({ unusual: true, what: 'processor' })
    })
  })
})
