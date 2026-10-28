import { describe, expect, it } from 'vitest'

// `yours.ts` imports Wasp's server; only its pure rule is under test here.
import { vi } from 'vitest'
vi.mock('wasp/server', () => ({ HttpError: class extends Error {}, prisma: {} }))

import { yoursOf } from '../yours'

const own = (over: Partial<Parameters<typeof yoursOf>[0][number]> = {}) => ({
  id: 's1', name: 'weekly-summary', path: '.agents/skills/weekly-summary', agentName: null, version: 3, on: true, ...over,
})

describe('yoursOf', () => {
  it('follows the person when it is published, switched on and the organisation allows it', () => {
    expect(yoursOf([own()], [], true, null)[0].follows).toBe(true)
  })
  it('does not follow when the organisation keeps skills in Your space', () => {
    expect(yoursOf([own()], [], false, null)[0].follows).toBe(false)
  })
  it('does not follow when never published or switched off', () => {
    expect(yoursOf([own({ version: null })], [], true, null)[0].follows).toBe(false)
    expect(yoursOf([own({ on: false })], [], true, null)[0].follows).toBe(false)
  })
  it('names the projects whose own skill of the same name wins', () => {
    const theirs = [{ key: 'weekly-summary', project: 'Website rebuild' }, { key: 'other', project: 'Docs' }]
    expect(yoursOf([own()], theirs, true, null)[0].setAsideIn).toEqual(['Website rebuild'])
  })
  it('inside one project, only that project counts', () => {
    const theirs = [{ key: 'weekly-summary', project: 'Website rebuild' }, { key: 'weekly-summary', project: 'Docs' }]
    expect(yoursOf([own()], theirs, true, 'Docs')[0].setAsideIn).toEqual(['Docs'])
  })
})
