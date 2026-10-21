/**
 * The quiet line a task's thread gets when its task changes hands (the overview's task-thread rules, 6).
 */
import { describe, it, expect } from 'vitest'
import { takeoverLine } from '../takeover'
import { ASSIGN_AN_AGENT } from '../lead'

describe('the line when a task changes hands @SC-976', () => {
  it('names the new agent and the one it took over from', () => {
    expect(takeoverLine('Writer', 'Developer')).toBe('Developer took over from Writer')
  })

  it('names the new agent alone when the task had none', () => {
    expect(takeoverLine(null, 'Developer')).toBe('Developer took over')
  })

  it('says to assign an agent when the task is left with none', () => {
    expect(takeoverLine('Writer', null)).toBe(`Writer is no longer assigned. ${ASSIGN_AN_AGENT}`)
  })

  it('says nothing when nothing changed', () => {
    expect(takeoverLine('Writer', 'Writer')).toBeNull()
    expect(takeoverLine(null, null)).toBeNull()
  })
})
