/** Where Settings › Memory opens from its address: the scope, the agent and the place a *Show in Memory* names. */
import { describe, expect, it } from 'vitest'
import { memoryPageStart } from '../memoryPageStart'

describe('Memory opened from its address @SC-991', () => {
  it('opens on the scope, agent and place named', () => {
    expect(memoryPageStart(new URLSearchParams('scope=AGENT_PLACE&agent=a1&place=project:p1&memory=k')))
      .toEqual({ scope: 'AGENT_PLACE', agentId: 'a1', placeKey: 'project:p1' })
  })

  it('opens on the person\'s own memory when nothing, or no known scope, is named', () => {
    expect(memoryPageStart(new URLSearchParams(''))).toEqual({ scope: 'PERSON', agentId: '', placeKey: '' })
    expect(memoryPageStart(new URLSearchParams('scope=ELSEWHERE'))).toEqual({ scope: 'PERSON', agentId: '', placeKey: '' })
  })
})
