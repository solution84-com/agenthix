/** Publish as task template: where it goes in the Library and what it holds, in words (spec D16, TM2). */
import { describe, expect, it } from 'vitest'
import { holdsWords, identityWords } from '../publishWords'
import { alreadyHereWords } from '../typeRules'

describe('publishing words', () => {
  it('names where it goes, published now or when a maintainer publishes it', () => {
    expect(identityWords('fernhill', 'launch-work', true)).toBe('In the Library as fernhill/launch-work, version 1.0.0: the first.')
    expect(identityWords('fernhill', 'launch-work', false)).toBe('In the Library as fernhill/launch-work, the first version, 1.0.0, when a maintainer publishes it.')
  })

  it('counts what it holds and says what never goes with it', () => {
    expect(holdsWords(2, 1)).toBe('It will hold 2 types and 1 field. No tasks, boards or sprints go with it.')
    expect(holdsWords(0, 3)).toBe('It will hold 3 fields. No tasks, boards or sprints go with it.')
  })

  it('names the types a project already has, once each', () => {
    expect(alreadyHereWords(['Bug', 'Feature request', 'Bug'])).toBe('Bug and Feature request are already in this project.')
    expect(alreadyHereWords([])).toBeNull()
  })
})
