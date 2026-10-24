import { describe, expect, it } from 'vitest'
import { compareVersions, withContext } from '../compareVersions'
import type { WorkflowVersionView } from '../workflowTypes'

const definition = (run: string) => ({
  name: 'w', description: '', steps: [{ name: 's', run, secrets: [], timeoutSeconds: null }], variables: [], parameters: [],
  hosts: [], github: {}, timeoutSeconds: 600, files: [],
}) as unknown as WorkflowVersionView['definition']

const version = (run: string, files: { path: string; text: string | null }[]) =>
  ({ definition: definition(run), files: files.map((f) => ({ ...f, executable: false, size: f.text?.length ?? 0 })) }) as unknown as WorkflowVersionView

describe('compareVersions @SC-1289', () => {
  it('shows an added file, a changed line and a changed setting', () => {
    const before = version('./a.sh', [{ path: 'a.sh', text: 'one\ntwo' }])
    const after = version('./b.sh', [{ path: 'a.sh', text: 'one\nthree' }, { path: 'b.sh', text: 'new' }])
    const diff = compareVersions(before, after)
    expect(diff.files.map((f) => [f.path, f.change])).toEqual([['a.sh', 'changed'], ['b.sh', 'added']])
    expect(diff.files[0].lines?.filter((l) => l.kind !== 'same').map((l) => `${l.kind}:${l.text}`)).toEqual(['removed:two', 'added:three'])
    expect(diff.settings.map((s) => s.setting)).toEqual(['steps[0]'])
  })
  it('says two equal files are the same', () => {
    const v = version('x', [{ path: 'a.sh', text: 'same' }])
    expect(compareVersions(v, v).files[0].change).toBe('same')
  })
})

describe('withContext @SC-1289', () => {
  it('folds the unchanged lines far from a change', () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({ kind: i === 10 ? 'added' as const : 'same' as const, text: String(i) }))
    const shown = withContext(lines, 2)
    expect(shown.filter((l) => l.kind === 'gap')).toEqual([{ kind: 'gap', hidden: 8 }, { kind: 'gap', hidden: 7 }])
    expect(shown.length).toBe(7)
  })
})
