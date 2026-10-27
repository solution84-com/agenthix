import { describe, expect, it } from 'vitest'
import { atQueryAt, pickerGroups } from '../atQuery'

describe('atQueryAt @SC-1545', () => {
  it('finds an @ at a word start, and what follows it up to the caret', () => {
    expect(atQueryAt('@', 1)).toEqual({ start: 0, end: 1, fragment: '' })
    expect(atQueryAt('see @rep', 8)).toEqual({ start: 4, end: 8, fragment: 'rep' })
    expect(atQueryAt('line\n@q3', 8)).toEqual({ start: 5, end: 8, fragment: 'q3' })
    expect(atQueryAt('see @report now', 11)).toEqual({ start: 4, end: 11, fragment: 'report' })
  })

  it('finds none inside a word, after a space, or with no caret', () => {
    expect(atQueryAt('mail me@example', 15)).toBeNull()
    expect(atQueryAt('see @rep ', 9)).toBeNull()
    expect(atQueryAt('see @rep', null)).toBeNull()
    expect(atQueryAt('see', 3)).toBeNull()
  })

  it('finds none when what follows is longer than a site takes', () => {
    expect(atQueryAt(`@${'a'.repeat(101)}`, 102)).toBeNull()
  })
})

describe('pickerGroups @SC-1545', () => {
  const file = (reference: string, name: string, folder: string) => ({ reference, name, folder })

  it('lists files under one heading, the folder beside each', () => {
    const { groups, away } = pickerGroups([{ name: 'Shop', state: 'ready', files: [file('files/a/q3.pdf', 'q3.pdf', 'files/a')] }])
    expect(groups).toEqual([{ id: 'files', heading: 'Files', items: [{ id: 'files:files/a/q3.pdf', reference: 'files/a/q3.pdf', label: 'q3.pdf', detail: 'files/a' }] }])
    expect(away).toEqual([])
  })

  it('names the place beside a file when there are several, and the places that did not answer', () => {
    const { groups, away } = pickerGroups([
      { name: 'Shop', state: 'ready', files: [file('files/q3.pdf', 'q3.pdf', 'files')] },
      { name: 'Finance', state: 'not-answering', files: [] },
    ])
    expect(groups[0]!.items[0]!.detail).toBe('Shop · files')
    expect(away).toEqual(['Finance'])
  })

  it('has no group when nothing was found', () => {
    expect(pickerGroups([{ name: 'Shop', state: 'ready', files: [] }]).groups).toEqual([])
  })
})
