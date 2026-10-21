import { describe, it, expect } from 'vitest'
import { startedByLine } from '../taskFacts'

const me = 'u-me'

describe('who started a run and for whom @SC-530 @SC-649 @SC-650', () => {
  it('reads the viewer as "you"', () => {
    expect(startedByLine({ kind: 'automation', name: null }, { id: me, name: 'Avery' }, me)).toBe('by automation, for you')
    expect(startedByLine({ kind: 'person', name: 'Ana' }, { id: 'u-bo', name: 'Bo' }, me)).toBe('by Ana, for Bo')
    expect(startedByLine({ kind: 'agent', name: 'Frontend dev' }, { id: me, name: 'Avery' }, me)).toBe('by Frontend dev, for you')
  })

  it('names a routine and a schedule, and says only whom it is for when the starter is unknown', () => {
    expect(startedByLine({ kind: 'routine', name: null }, { id: me, name: 'Avery' }, me)).toBe('by a routine, for you')
    expect(startedByLine({ kind: 'schedule', name: null }, { id: me, name: 'Avery' }, me)).toBe('on schedule, for you')
    expect(startedByLine({ kind: 'unknown', name: null }, { id: 'u-bo', name: 'Bo' }, me)).toBe('for Bo')
  })
})
