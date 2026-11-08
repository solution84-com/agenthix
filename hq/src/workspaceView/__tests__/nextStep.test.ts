/** The one next-step button's states, and how *Updating…* follows the branch's agent. */
import { describe, expect, it } from 'vitest'
import { followUpdate, nextStepOf } from '../nextStep'
import { possessive, updateWhy, versionLabel } from '../words'
import type { BranchLineView } from '../../branches/views'

const at = (over: Partial<Parameters<typeof nextStepOf>[0]> = {}) =>
  nextStepOf({ git: true, canAct: true, line: { behind: 0 }, version: null, updating: false, clashed: false, ...over })

describe('the next-step button', () => {
  it('without Git offers Git, to a person who may act only', () => {
    expect(at({ git: false, line: null })).toEqual({ kind: 'git' })
    expect(at({ git: false, line: null, canAct: false })).toEqual({ kind: 'none' })
  })

  it('on main says nothing at the latest, and goes back or returns main at an older version', () => {
    expect(at({ line: null })).toEqual({ kind: 'none' })
    expect(at({ line: null, version: 'c'.repeat(40) })).toEqual({ kind: 'older', mayReturn: true })
    expect(at({ line: null, version: 'c'.repeat(40), canAct: false })).toEqual({ kind: 'older', mayReturn: false })
  })

  it('on a branch merges, brings it up to date when behind or clashed, and says Updating… while that runs', () => {
    expect(at()).toEqual({ kind: 'merge' })
    expect(at({ line: { behind: 3 } })).toEqual({ kind: 'update', clashed: false })
    expect(at({ clashed: true })).toEqual({ kind: 'update', clashed: true })
    expect(at({ line: { behind: 3 }, updating: true })).toEqual({ kind: 'updating' })
  })

  it('says whose merge request waits, on the merge step only', () => {
    expect(at({ line: { behind: 0, mergeAsked: { agentName: 'Kernel' } } })).toEqual({ kind: 'merge', asked: 'Kernel' })
    expect(at({ line: { behind: 0, mergeAsked: null } })).toEqual({ kind: 'merge' })
    expect(at({ line: { behind: 2, mergeAsked: { agentName: 'Kernel' } } })).toEqual({ kind: 'update', clashed: false })
  })

  it('gives a Viewer no button on a branch', () => {
    expect(at({ canAct: false, line: { behind: 3 } })).toEqual({ kind: 'none' })
  })
})

describe('Updating… follows the agent', () => {
  const ask = { branchId: 'b1', sawWorking: false }
  it('holds until the agent has started, and ends when it stops', () => {
    expect(followUpdate(ask, { id: 'b1', working: null })).toBe(ask)
    const started = followUpdate(ask, { id: 'b1', working: { agentName: 'Kernel' } })
    expect(started).toEqual({ branchId: 'b1', sawWorking: true })
    expect(followUpdate(started, { id: 'b1', working: null })).toBeNull()
  })

  it('is kept while another branch is in view', () => {
    expect(followUpdate(ask, { id: 'b2', working: null })).toBe(ask)
    expect(followUpdate(ask, null)).toBe(ask)
  })
})

describe('its words', () => {
  const line = { name: 'login-page', behind: 3, agentName: 'Kernel', working: null } as unknown as BranchLineView
  it('says why on hover', () => {
    expect(updateWhy(line, false)).toBe('main has 3 newer versions. Kernel brings them into this branch, then you can merge.')
    expect(updateWhy(line, true)).toBe('This branch and main changed the same files. Kernel brings them into this branch, then you can merge.')
  })

  it('names versions and possessives plainly', () => {
    expect(versionLabel(14, true)).toBe('v14 · latest')
    expect(versionLabel(12, false)).toBe('v12')
    expect(possessive('case-study-drafts')).toBe("case-study-drafts'")
    expect(possessive('Website relaunch')).toBe("Website relaunch's")
  })
})
