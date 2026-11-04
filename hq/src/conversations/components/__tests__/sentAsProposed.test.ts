import { describe, it, expect } from 'vitest'
import { sentAsProposed } from '../sentAsProposed'

describe('a proposed file sent back after an edit to SKILL.md', () => {
  it('goes back as its bytes, so a file that is not valid text is not emptied', () => {
    expect(sentAsProposed({ path: 'scripts/data.bin', text: null, base64: '/9j/' })).toEqual({ path: 'scripts/data.bin', base64: '/9j/' })
  })

  it('goes back as its bytes for a text file too', () => {
    expect(sentAsProposed({ path: 'scripts/run.sh', text: 'echo hi', base64: 'ZWNobyBoaQ==' })).toEqual({ path: 'scripts/run.sh', base64: 'ZWNobyBoaQ==' })
  })

  it('falls back to the text when no bytes came', () => {
    expect(sentAsProposed({ path: 'a.md', text: 'x' })).toEqual({ path: 'a.md', text: 'x' })
  })
})
