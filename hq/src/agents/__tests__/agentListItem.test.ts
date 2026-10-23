import { describe, it, expect } from 'vitest'
import type { Agent } from '@prisma/client'
import { agentListItem } from '../agentListItem'
import { DEFAULT_MODEL } from '../models'

const agent: Agent = {
  id: 'a1', name: 'Ada', handle: 'ada', role: 'Reviewer',
  isKernel: false, avatarUrl: '/agents/a1/images/x.png', coverUrl: '/agents/a1/images/c.png',
  allowedTools: ['Read'], allowedBashPatterns: ['ls'], approval: 'immediate',
  createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
}

describe('agentListItem', () => {
  it("answers the agent's facts, and none of its permissions, cover or timestamps", () => {
    expect(agentListItem(agent)).toEqual({
      id: 'a1', name: 'Ada', handle: 'ada', role: 'Reviewer', avatarUrl: '/agents/a1/images/x.png',
      defaultModel: DEFAULT_MODEL, runtime: 'claude-sdk', isKernel: false, approval: 'immediate',
      voiceEnabled: true, voiceId: null, voiceTtsModel: null,
    })
  })

  it('counts an approval the row does not name as the default', () => {
    expect(agentListItem({ ...agent, approval: 'sometimes' }).approval).toBe('deferred')
  })
})
