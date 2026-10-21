import { describe, it, expect } from 'vitest'
import { screenOf } from '../people/usePeopleToolUrl'

const at = (query: string) => screenOf(new URLSearchParams(query))

describe('screenOf (the People tool\'s place in the address) @SC-599', () => {
  it('is the list unless the address says otherwise', () => {
    expect(at('tool=people')).toEqual({ kind: 'list' })
  })

  it('reads Add, a person, and Remove or Leave', () => {
    expect(at('tool=people&pview=add')).toEqual({ kind: 'add' })
    expect(at('tool=people&person=u1')).toEqual({ kind: 'person', userId: 'u1' })
    expect(at('tool=people&person=u1&pview=remove')).toEqual({ kind: 'remove', userId: 'u1' })
    expect(at('tool=people&person=u1&pview=leave')).toEqual({ kind: 'leave', userId: 'u1' })
  })

  it('ignores Remove with no person', () => {
    expect(at('tool=people&pview=remove')).toEqual({ kind: 'list' })
  })
})
