import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinition, type WorkflowDefinition } from '@agenthix/core'
import { diffFiles, diffLines, diffSettings } from '../versionDiff'

const bytes = (s: string) => new Uint8Array(Buffer.from(s))
const def = (raw: unknown): WorkflowDefinition => {
  const p = parseWorkflowDefinition(raw)
  if (!p.ok) throw new Error(JSON.stringify(p.errors))
  return p.definition
}

describe('a version\'s diff against the approved one', () => {
  it('diffs lines', () => {
    expect(diffLines('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'same', text: 'c' }, { kind: 'added', text: 'd' },
    ])
  })

  it('says which files were added, removed, changed or kept, and a change of mode', () => {
    const before = [{ path: 'a.sh', content: bytes('x'), executable: false }, { path: 'gone', content: bytes('y'), executable: false }]
    const after = [{ path: 'a.sh', content: bytes('x'), executable: true }, { path: 'new', content: bytes('z'), executable: false }]
    expect(diffFiles(before, after).map((f) => [f.path, f.change, f.modeChanged])).toEqual([
      ['a.sh', 'changed', true], ['gone', 'removed', false], ['new', 'added', false],
    ])
  })

  it('shows a binary file as changed without lines', () => {
    const [f] = diffFiles([{ path: 'b', content: Uint8Array.of(0, 1), executable: false }], [{ path: 'b', content: Uint8Array.of(0, 2), executable: false }])
    expect(f).toMatchObject({ change: 'changed', binary: true, lines: null })
  })

  it('shows a step newly given a secret', () => {
    const a = def({ name: 'w', steps: [{ name: 'S', run: 'true' }] })
    const b = def({ name: 'w', steps: [{ name: 'S', run: 'true', secrets: ['KEY'] }] })
    expect(diffSettings(a, b)).toEqual([{ setting: 'steps[0]', before: 'S | run: true | secrets: none', after: 'S | run: true | secrets: KEY' }])
  })
})
