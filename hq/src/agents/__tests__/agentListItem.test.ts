import { describe, it, expect } from 'vitest'
import type { Agent } from '@prisma/client'
import { agentListItem } from '../agentListItem'

const agent: Agent = {
  id: 'a1', name: 'Ada', handle: 'ada', role: 'Reviewer', defaultModel: 'claude-sonnet-4-6', runtime: 'opencode',
  isKernel: false, avatarUrl: '/agents/a1/images/x.png', coverUrl: '/agents/a1/images/c.png',
  allowedTools: ['Read'], allowedBashPatterns: ['ls'], approval: 'immediate', voiceEnabled: true, voiceId: 'v1',
  voiceTtsModel: 'tts-1', createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
}

describe('agentListItem', () => {
  it("answers the agent's facts and voice, and none of its permissions, cover or timestamps", () => {
    expect(agentListItem(agent)).toEqual({
      id: 'a1', name: 'Ada', handle: 'ada', role: 'Reviewer', avatarUrl: '/agents/a1/images/x.png',
      defaultModel: 'claude-sonnet-4-6', runtime: 'opencode', isKernel: false, approval: 'immediate',
      voiceEnabled: true, voiceId: 'v1', voiceTtsModel: 'tts-1',
    })
  })

  it('counts a runtime or an approval the row does not name as the default', () => {
    const item = agentListItem({ ...agent, runtime: 'other', approval: 'sometimes' })
    expect(item.runtime).toBe('claude-sdk')
    expect(item.approval).toBe('deferred')
  })
})
