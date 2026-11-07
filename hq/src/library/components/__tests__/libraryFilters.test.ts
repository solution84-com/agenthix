import { describe, it, expect } from 'vitest'
import { chipCounts, filterRows, isTypeFilter, type LibraryFilter } from '../libraryFilters'
import { SAMPLE } from './fixtures'

const all: LibraryFilter = { search: '', type: 'all', needsYou: false }
const keys = (f: Partial<LibraryFilter>) => filterRows(SAMPLE, { ...all, ...f }).map(r => r.key)

describe('the Library’s filters @SC-1630', () => {
  it('shows every asset with no filter', () => expect(keys({})).toHaveLength(SAMPLE.length))

  it('narrows to a type', () => {
    expect(keys({ type: 'agent' })).toEqual(['a1'])
    expect(keys({ type: 'board' })).toEqual(['b1'])
    expect(keys({ type: 'team' })).toEqual([])
    expect(keys({ type: 'skill' })).toHaveLength(SAMPLE.length - 2)
  })

  it('narrows to what needs the person: a review, an update, a draft, a skill no agent uses', () => {
    expect(keys({ needsYou: true })).toEqual(['s1', 's2', 's3', 'proposal:p1', 's7'])
  })

  it('searches every kind by words in its name, identity, signer or who has it', () => {
    expect(keys({ search: 'sprint' })).toEqual(['b1'])
    expect(keys({ search: 'acme' })).toEqual(['s3', 's6'])
    expect(keys({ search: 'fernhill/changelog' })).toEqual(['s7'])
    expect(keys({ search: 'ada has' })).toEqual(['s2'])
    expect(keys({ search: 'CODE review' })).toEqual(['s1', 's5'])
    expect(keys({ search: 'nothing like this' })).toEqual([])
  })

  it('combines type, state and search', () => {
    expect(keys({ type: 'skill', needsYou: true, search: 'code' })).toEqual(['s1'])
    expect(keys({ type: 'agent', needsYou: true })).toEqual([])
  })

  it('counts each chip over what the other filters leave', () => {
    const c = chipCounts(SAMPLE, { ...all, search: 'review' })
    expect(c.types.all).toBe(3)
    expect(c.types.skill).toBe(3)
    expect(c.types.agent).toBe(0)
    expect(c.needsYou).toBe(1)
    expect(chipCounts(SAMPLE, { ...all, type: 'board' }).needsYou).toBe(0)
    expect(chipCounts(SAMPLE, all).needsYou).toBe(5)
    expect(chipCounts(SAMPLE, { ...all, needsYou: true }).types.skill).toBe(5)
    expect(chipCounts(SAMPLE, all).types.skill).toBe(SAMPLE.length - 2)
  })

  it('reads a filter out of an address only when it names one', () => {
    expect(isTypeFilter('skill')).toBe(true)
    expect(isTypeFilter('marketplace')).toBe(false)
  })
})
