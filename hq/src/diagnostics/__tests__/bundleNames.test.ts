import { describe, it, expect } from 'vitest'
import { BundleNames } from '../bundleNames'

const names = new BundleNames([
  { text: 'u-1234-5678', placeholder: 'person-1' },
  { text: 'Dana Smith', placeholder: 'person-1' },
  { text: 'dana', placeholder: 'person-1' },
  { text: 'Website Redesign', placeholder: 'project-1' },
  { text: 'WEB', placeholder: 'project-1' },
  { text: 'Frontend dev', placeholder: 'agent-1' },
  { text: 'frontend-dev', placeholder: 'agent-1' },
  { text: 'AB', placeholder: 'person-2' },
])

describe('BundleNames: people, projects and agents as placeholders, the same throughout @SC-730', () => {
  it('replaces every way each is written', () => {
    expect(names.apply('run for Dana Smith (dana, u-1234-5678) on Website Redesign by Frontend dev (@frontend-dev), task WEB-41'))
      .toBe('run for person-1 (person-1, person-1) on project-1 by agent-1 (@agent-1), task project-1-41')
  })

  it('prefers the longest name, and leaves words that only contain one alone', () => {
    expect(names.apply('Website Redesign and Website')).toBe('project-1 and Website')
    expect(names.apply('dashboard webhook WEBSITE danax')).toBe('dashboard webhook WEBSITE danax')
  })

  it('leaves names too short to replace safely, and gives an id its placeholder', () => {
    expect(names.apply('AB testing')).toBe('AB testing')
    expect(names.of('u-1234-5678')).toBe('person-1')
    expect(names.of('nobody')).toBeNull()
  })

  it('handles names with characters a pattern would treat specially', () => {
    const odd = new BundleNames([{ text: 'C++ (beta)', placeholder: 'project-9' }])
    expect(odd.apply('building C++ (beta) now')).toBe('building project-9 now')
  })
})

describe("a tool call's command never reaches a bundle @SC-730", () => {
  it('keeps what was blocked and why, and leaves out the command', async () => {
    const { withoutToolInput } = await import('../supportBundle')
    expect(withoutToolInput('[hitl] BLOCKED run=r-1 tool=Bash cmd=cat ~/.ssh/id_rsa (pattern=never)'))
      .toBe('[hitl] BLOCKED run=r-1 tool=Bash cmd=[left out]')
    expect(withoutToolInput('[deferred] run=r-1 tool=Bash cmd=rm -rf build — skipped, continuing'))
      .toBe('[deferred] run=r-1 tool=Bash cmd=[left out]')
    expect(withoutToolInput('BLOCKED tool=Bash cmd=curl -H "X: (tok123)" https://a.example — more (pattern=never)'))
      .toBe('BLOCKED tool=Bash cmd=[left out]')
    expect(withoutToolInput('BLOCKED tool=Bash cmd=echo hi\nnext line')).toBe('BLOCKED tool=Bash cmd=[left out]\nnext line')
  })
})
