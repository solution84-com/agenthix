import { describe, it, expect } from 'vitest'
import type { Agent } from '@prisma/client'
import { agentListItem } from '../agentListItem'

const agent: Agent = {
  id: 'a1', name: 'Ada', handle: 'ada', role: 'Reviewer',
  isKernel: false, avatarUrl: '/agents/a1/images/x.png', coverUrl: '/agents/a1/images/c.png',
  avatarRecipe: null, coverRecipe: null,
  allowedTools: ['Read'], allowedBashPatterns: ['ls'], approval: 'immediate',
  createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'), madeFromVersionId: null,
}

describe('agentListItem', () => {
  it("answers the agent's facts, and none of its permissions, cover or timestamps", () => {
    expect(agentListItem(agent)).toEqual({
      id: 'a1', name: 'Ada', handle: 'ada', role: 'Reviewer', avatarUrl: '/agents/a1/images/x.png',
      isKernel: false, approval: 'immediate',
    })
  })

  it('counts an approval the row does not name as the default', () => {
    expect(agentListItem({ ...agent, approval: 'sometimes' }).approval).toBe('deferred')
  })
})
