import { describe, it, expect } from 'vitest'
import { scannedFacts, skillFacts } from '../skillFacts'

const md = (header: string) => `---\n${header}\n---\n\n# Heading\n\nBody`

describe("a skill's facts for the / picker @SC-1656", () => {
  it('reads the title and the first line of the description', () => {
    expect(skillFacts(md('name: Code Review\ndescription: |\n  Review a change.\n  Second line.'), 'code-review')).toEqual({
      title: 'Code Review', description: 'Review a change.', userInvocable: true,
    })
  })

  it('falls back to the heading, then the name, when the file names nothing', () => {
    expect(skillFacts(md('description: x'), 'review').title).toBe('Heading')
    expect(skillFacts(null, 'review')).toEqual({ title: 'review', description: '', userInvocable: true })
  })

  it('leaves out a skill that sets user-invocable to false, as a boolean or a string', () => {
    expect(skillFacts(md('user-invocable: false'), 'a').userInvocable).toBe(false)
    expect(skillFacts(md('user-invocable: "False"'), 'a').userInvocable).toBe(false)
    expect(skillFacts(md('user-invocable: true'), 'a').userInvocable).toBe(true)
  })

  it('bounds a long description', () => {
    expect(skillFacts(md(`description: ${'x'.repeat(500)}`), 'a').description.length).toBe(200)
  })

  it('shows a skill hq holds no version of by what the last scan read, or its folder', () => {
    expect(scannedFacts({ name: 'Code Review', description: 'Review a change.\nMore.' }, 'review'))
      .toEqual({ title: 'Code Review', description: 'Review a change.', userInvocable: true })
    expect(scannedFacts({ name: ' ', description: '' }, 'review')).toEqual({ title: 'review', description: '', userInvocable: true })
    expect(scannedFacts({ name: 'n', description: 'y'.repeat(500) }, 'a').description.length).toBe(200)
  })
})
