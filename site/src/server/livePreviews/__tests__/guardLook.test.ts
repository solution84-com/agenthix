/** What the guard puts in its findings about a process it did not expect: never a secret handed to the live preview. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import type { LivePreviewTemplate } from '../container/template'

vi.mock('../container/inspect', () => ({ templateDifferences: () => [] }))

import { PreviewWatch, type LookDeps } from '../guard/look'
import { resetPreviewMasksForTests, setPreviewMask } from '../secrets/previewMasks'

const priv = 'Uid: 1001 1001 1001 1001 Gid: 1001 1001 1001 1001 CapPrm: 0000000000000000 CapEff: 0000000000000000 NoNewPrivs: 1'
const proc = (pid: number, ppid: number, cmd: string) => [`P ${pid} (x) S ${ppid} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${pid}`, `C ${cmd}`, `U ${priv}`]
const stdout = (...procs: string[][]) => ['self 50', ...procs.flat(), 'NET', 'sl local_address rem_address st', 'END'].join('\n')

function depsWith(out: string): LookDeps {
  return {
    docker: {
      events: () => ({ stop() {} }),
      containerIds: async () => ['c1'],
      inspect: async () => [{ id: 'c1', name: 'own', running: true, paused: false, oomKilled: false, addresses: [], raw: {} }],
      usage: async () => [],
      kill: async () => {},
    },
    template: () => ({ name: 'own', image: 'img', user: '1001:1001' }) as LivePreviewTemplate,
    helper: async () => ({ exitCode: 0, stdout: out }),
    activity: { spared: () => new Set(), registeredPorts: () => new Set(), siteExecGoing: () => false, busy: () => false },
    drops: async () => null,
    protectionsProblem: async () => null,
    now: () => 0,
  }
}

withFeature('livePreview', () => {
  describe('a finding about an unexpected process @SC-1738', () => {
    beforeEach(() => resetPreviewMasksForTests())

    it('carries the command masked against the secrets handed to the live preview (F-site-17-03)', async () => {
      setPreviewMask('lp-1', async text => text.replaceAll('hunter2', '***'))
      const watch = new PreviewWatch({ id: 'lp-1', projectId: null, paused: false })
      const findings = await watch.look(depsWith(stdout(proc(1, 0, 'init'), proc(7, 1, 'tail'), proc(50, 0, 'sh'), proc(80, 1, 'daemon --token=hunter2'))))
      const what = findings.flatMap(f => ('facts' in f && f.signal === 'unexpectedProcess' ? [f.facts.what] : []))
      expect(what).toEqual(['daemon --token=***'])
    })
  })
})
