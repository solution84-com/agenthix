/**
 * A container with a live preview's label that the guard does not watch (live preview spec section 6, *The guard*):
 * one turning up for a live preview that is not open is no one's, and is removed and reported. The site's own stop
 * ends the watch before it removes the containers, so the removal's events (kill, die, stop, destroy) are not a stray
 * and are neither removed again nor reported. Fake Docker: no Docker here.
 */
import { describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { isSiteFeatureOn } from '../../features/siteFeatures'
import type { DockerEvent } from '../guard/guardDocker'
import type { LivePreviewTemplate } from '../container/template'
import { LivePreviewGuard } from '../guard/guard'
import { Logger } from '../../utils/logger'

function guarded() {
  const w = { onEvent: null as null | ((e: DockerEvent) => void), killed: [] as string[][] }
  const guard = new LivePreviewGuard({
    docker: {
      events: onEvent => { w.onEvent = onEvent; return { stop: () => { w.onEvent = null } } },
      containerIds: async () => [],
      inspect: async () => [],
      usage: async () => [],
      kill: async ids => { w.killed.push(ids) },
    },
    template: () => ({ name: 'lp-watched', image: 'img', user: '1001:1001' }) as LivePreviewTemplate,
    helper: async () => ({ exitCode: 0, stdout: '' }),
    activity: { spared: () => new Set(), registeredPorts: () => new Set(), siteExecGoing: () => false, busy: () => false },
    drops: async () => null,
    protectionsProblem: async () => null,
    now: () => Date.now(),
    actions: {
      pause: async () => {}, stop: async () => {}, killContainers: async () => {}, killProcesses: async () => {},
      stopApp: async () => true, tell: () => {}, now: () => Date.now(),
    },
    // The watched one stays live; any other has stopped.
    watched: async id => (id === 'watched' ? { id, projectId: 'p1', paused: false } : null),
    isLive: async id => id === 'watched',
    pauseForLineLoss: async () => {},
    resumeAfterLineLoss: async () => {},
    running: async () => [],
    stopForMemory: async () => {},
    hqLineUp: () => true,
    livePreviewOn: () => isSiteFeatureOn('livePreview'),
    report: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
  })
  const send = async (action: string, livePreviewId = 'stopped') => {
    w.onEvent?.({ action, containerId: 'c9', name: `lp-${livePreviewId}`, livePreviewId, at: Date.now() })
    await new Promise(r => setTimeout(r, 0))
  }
  return { w, guard, send }
}

async function streaming() {
  const t = guarded()
  t.guard.start()
  // Watching one live preview opens Docker's event stream for all of them.
  await t.guard.watch({ id: 'watched', projectId: 'p1', paused: false }).catch(() => {})
  expect(t.w.onEvent).not.toBeNull()
  return t
}

withFeature('livePreview', () => {
  describe("the guard and a live preview it no longer watches @SC-1748", () => {
    it("takes the site's own stop removing its container as no stray: nothing removed again, nothing logged", async () => {
      const errors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
      const { w, guard, send } = await streaming()
      for (const action of ['kill', 'die', 'stop', 'destroy']) await send(action)
      expect(w.killed).toEqual([])
      expect(errors.mock.calls.filter(([m]) => /which is not open/.test(String(m)))).toEqual([])
      guard.stop()
      errors.mockRestore()
    })

    it('removes and reports a container that turns up for a live preview that is not open', async () => {
      const errors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
      const { w, guard, send } = await streaming()
      await send('create')
      await send('start')
      expect(w.killed).toEqual([['c9'], ['c9']])
      expect(errors).toHaveBeenCalledWith(expect.stringMatching(/live preview stopped, which is not open, was found and removed/))
      guard.stop()
      errors.mockRestore()
    })

    it('removes a command run in such a container', async () => {
      const { w, guard, send } = await streaming()
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
      await send('exec_create: sh -c id')
      expect(w.killed).toEqual([['c9']])
      guard.stop()
      vi.restoreAllMocks()
    })
  })
})
