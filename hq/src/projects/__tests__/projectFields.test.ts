import { describe, it, expect } from 'vitest'
import { checkedLinkId, checkedProjectDescription, checkedProjectName, MAX_PROJECT_DESCRIPTION_LENGTH, MAX_PROJECT_NAME_LENGTH } from '../projectFields'

const refused = expect.objectContaining({ statusCode: 400 })

describe('a project name and description are checked before they reach the database (F-hq-4-03)', () => {
  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['not text', 7],
    ['missing', undefined],
    ['too long', 'x'.repeat(MAX_PROJECT_NAME_LENGTH + 1)],
  ])('refuses a name that is %s', (_what, name) => {
    expect(() => checkedProjectName(name)).toThrow(refused)
  })

  it('gives a name trimmed, and takes one of the longest length', () => {
    expect(checkedProjectName('  Alpha  ')).toBe('Alpha')
    expect(checkedProjectName('x'.repeat(MAX_PROJECT_NAME_LENGTH))).toHaveLength(MAX_PROJECT_NAME_LENGTH)
  })

  it('leaves a description out or clears it, takes text, and refuses anything else or very long', () => {
    expect(checkedProjectDescription(undefined)).toBeUndefined()
    expect(checkedProjectDescription(null)).toBeNull()
    expect(checkedProjectDescription('About it')).toBe('About it')
    expect(() => checkedProjectDescription({ a: 1 })).toThrow(refused)
    expect(() => checkedProjectDescription('x'.repeat(MAX_PROJECT_DESCRIPTION_LENGTH + 1))).toThrow(refused)
  })

  it('takes an id or null for a product, programme or agent, and refuses text that is not one', () => {
    expect(checkedLinkId(undefined, 'product')).toBeUndefined()
    expect(checkedLinkId(null, 'product')).toBeNull()
    expect(checkedLinkId('p1', 'product')).toBe('p1')
    expect(() => checkedLinkId(3, 'product')).toThrow(refused)
    expect(() => checkedLinkId('', 'agent')).toThrow(refused)
  })
})
