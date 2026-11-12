/** Where Settings › Memory opens from its address: the agent a *Show in Memory* names. */
import { describe, expect, it } from 'vitest'
import { memoryPageStart } from '../memoryPageStart'

describe('Memory opened from its address @SC-2108', () => {
  it('opens on the agent named, reading an older line\'s address too', () => {
    expect(memoryPageStart(new URLSearchParams('scope=AGENT_PERSON&agent=a1&memory=k'))).toEqual({ agentId: 'a1' })
  })

  it('opens on every memory when no agent is named', () => {
    expect(memoryPageStart(new URLSearchParams(''))).toEqual({ agentId: '' })
  })
})
