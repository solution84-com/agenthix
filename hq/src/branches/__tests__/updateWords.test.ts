import { describe, expect, it } from 'vitest'
import { clashesLeftNote, updateNote } from '../updateWords'

const w = { branch: 'add-login-page', main: 'main' }

describe('what the agent is told after update_from_main @SC-1672', () => {
  it('says what happened and the one thing to do next', () => {
    expect(updateNote('updated', w)).toContain('main is merged into add-login-page')
    expect(updateNote('up_to_date', w)).toContain('Nothing was changed.')
    expect(updateNote('uncommitted', w)).toContain('Call commit first, then call update_from_main again')
    const clash = updateNote('clashes', w, ['a.css', 'b.ts'])
    expect(clash).toContain('a.css, b.ts')
    expect(clash).toContain('then call commit: that commit finishes the merge')
    expect(updateNote('merge_under_way', w, ['a.css'])).toContain('then call commit to finish it')
  })

  it('names at most twenty files and counts the rest', () => {
    const many = Array.from({ length: 23 }, (_, i) => `f${i}`)
    expect(updateNote('clashes', w, many)).toContain('f19 and 3 more')
    expect(clashesLeftNote(many)).toContain('f19 and 3 more')
  })
})
