import { describe, it, expect } from 'vitest'
import {
  atCapacityText, nearlyOutText, parseRunResourceShortage, runResourceSentence,
} from '../runResource.js'

const GIB = 1024 ** 3

describe('a run that stopped for lack of resources', () => {
  it('says it ran out of memory, with the limit it hit and who was told', () => {
    expect(runResourceSentence({ cause: 'memory', limit: 4 * GIB }, 'office-server')).toBe(
      'This run stopped: it ran out of memory (each run on office-server gets 4 GB). Your fleet admins have been told.')
  })

  it('says the disk filled', () => {
    expect(runResourceSentence({ cause: 'disk', limit: null }, 'office-server')).toBe(
      'This run stopped: the disk on office-server is full. Your fleet admins have been told.')
  })

  it('says it reached the process limit, with the limit', () => {
    expect(runResourceSentence({ cause: 'processes', limit: 4096 }, 'office-server')).toBe(
      'This run stopped: it started more processes than a run may (each run on office-server may start 4096). Your fleet admins have been told.')
  })

  it('still names the cause when the site did not know the limit', () => {
    expect(runResourceSentence({ cause: 'memory', limit: null }, 'laptop')).toBe(
      'This run stopped: it ran out of the memory each run on laptop gets. Your fleet admins have been told.')
  })

  it('takes only a cause from the closed set off the wire, never a raw code', () => {
    expect(parseRunResourceShortage({ cause: 'memory', limit: 4 * GIB })).toEqual({ cause: 'memory', limit: 4 * GIB })
    expect(parseRunResourceShortage({ cause: 'OOMKilled', limit: 1 })).toBeNull()
    expect(parseRunResourceShortage({ cause: 'ENOSPC' })).toBeNull()
    expect(parseRunResourceShortage('memory')).toBeNull()
    expect(parseRunResourceShortage({ cause: 'processes', limit: -3 })).toEqual({ cause: 'processes', limit: null })
    expect(parseRunResourceShortage({ cause: 'disk', limit: 99 })).toEqual({ cause: 'disk', limit: null })
  })
})

describe('a machine nearly out of something, as a member reads it', () => {
  it('is a sentence with no figure in it', () => {
    for (const shortage of ['disk', 'memory'] as const) {
      const text = nearlyOutText('office-server', shortage)
      expect(text).toBe(`office-server is nearly out of ${shortage}; runs may fail. Your fleet admins have been told.`)
      expect(text).not.toMatch(/\d/)
    }
    expect(nearlyOutText('laptop', ['disk', 'memory'])).toBe('laptop is nearly out of disk and memory; runs may fail. Your fleet admins have been told.')
  })
})

describe('runs waiting for the site', () => {
  it('reads as the site being at capacity', () => {
    expect(atCapacityText('office-server')).toBe('Runs are waiting: office-server is at capacity')
    expect(atCapacityText(null)).toBe('Runs are waiting: its site is at capacity')
  })
})
