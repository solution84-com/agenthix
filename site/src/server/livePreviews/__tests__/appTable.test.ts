/**
 * A live preview's apps: an app that listens only on `localhost` runs (F13), the port the guard registers is the
 * app's, and the app follows its live preview.
 */
import { describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import type { LivePreviewAppStateEvent } from '@agenthix/core'
import { AppTable, type AppDeps, type Listening } from '../apps/appTable'
import { APP_SCRIPT_NAME } from '../apps/appProcess'

const LP = { id: 'lp-1', personId: 'p1', root: '/projects/pr1/clones/c1', hostDir: '/x' }
const SPEC = { appId: 'abcdefghijklmnopqrstuvwxyz', name: 'web', folder: 'web', command: 'npm run dev', port: 5173 }

function table(listening: () => Listening) {
  const told: LivePreviewAppStateEvent[] = []
  const spawned: { argv: string[]; cwd: string }[] = []
  let now = 0
  const deps: AppDeps = {
    spawn: async (_id, _root, argv, opts, onOutput) => {
      spawned.push({ argv, cwd: opts.cwd })
      setTimeout(() => onOutput('live-preview-app-pid 42\n'), 0)
      return { exited: new Promise<number>(() => {}), detach() {}, stdin: null, stdout: null, stderr: null }
    },
    listening: async () => listening(),
    kill: async () => {},
    tell: e => { told.push(e) },
    beforeStart: async () => null,
    servicePorts: () => new Set(),
    now: () => now,
    sleep: async ms => { now += ms },
  }
  return { apps: new AppTable(deps), told, spawned }
}

const settle = () => new Promise(r => setTimeout(r, 10))

withFeature('livePreview', () => {
  describe('apps in a live preview @SC-1736', () => {
    it('runs an app that listens only on localhost', async () => {
      let listening: Listening = { open: [], loopback: [] }
      const { apps, told, spawned } = table(() => listening)
      const started = await apps.start(LP, SPEC, null)
      expect('app' in started && started.app.state).toBe('starting')
      expect(spawned[0]!.argv).toContain(APP_SCRIPT_NAME)
      expect(spawned[0]!.cwd).toBe('/projects/pr1/clones/c1/web')
      listening = { open: [], loopback: [5173] }
      await settle()
      expect(told.at(-1)!.app.state).toBe('running')
      expect(apps.portFor('lp-1', SPEC.appId)).toBe(5173)
      expect(apps.registeredPorts('lp-1')).toEqual(new Set([5173]))
      expect(apps.spared('lp-1')).toEqual(new Set([42]))
    })

    it('refuses a port something else listens on, and a reserved one', async () => {
      const { apps } = table(() => ({ open: [5173], loopback: [] }))
      expect(await apps.start(LP, SPEC, null)).toMatchObject({ refused: 'portTaken' })
      expect(await apps.start(LP, { ...SPEC, port: 4096 }, null)).toMatchObject({ refused: 'badSpec' })
    })

    it('pauses with its live preview and stops with it', async () => {
      let listening: Listening = { open: [], loopback: [] }
      const { apps, told } = table(() => listening)
      await apps.start(LP, SPEC, null)
      listening = { open: [5173], loopback: [] }
      await settle()
      const since = new Date().toISOString()
      apps.previewChanged('lp-1', { state: 'paused', since, reason: 'guard', signal: null, detail: 'x' })
      expect(told.at(-1)!.app.state).toBe('paused')
      expect(apps.openable('lp-1', SPEC.appId)).toBe(false)
      apps.previewChanged('lp-1', { state: 'stopped', since, reason: 'person', signal: null, detail: 'x' })
      expect(told.at(-1)!.app.state).toBe('stopped')
      expect(apps.list('lp-1')).toEqual([])
    })
  })
})
