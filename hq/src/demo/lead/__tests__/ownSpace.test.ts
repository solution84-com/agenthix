import { describe, expect, it } from 'vitest'
import { inOwnSpace, OWN_SPACE, THIS_AGENT, type SpaceFor } from '../ownSpace'

const turn = { personId: 'person-1', agentId: 'agent-writer' }

function spaces() {
  const asked: string[][] = []
  const spaceFor: SpaceFor = async (personId, agentId) => { asked.push([personId, agentId]); return `space-${personId}` }
  return { asked, spaceFor }
}

describe("a lead script's calls in the visitor's own space @SC-1956", () => {
  it('names the space and the agent by id, making the space ready once for the turn', async () => {
    const { asked, spaceFor } = spaces()
    const calls = await inOwnSpace([
      { toolName: 'create_task', input: { projectId: OWN_SPACE, title: 'A', when: 'now', assignedAgentId: THIS_AGENT } },
      { toolName: 'list_tasks', input: { projectId: OWN_SPACE } },
    ], turn, spaceFor)
    expect(calls).toEqual([
      { toolName: 'create_task', input: { projectId: 'space-person-1', title: 'A', when: 'now', assignedAgentId: 'agent-writer' } },
      { toolName: 'list_tasks', input: { projectId: 'space-person-1' } },
    ])
    expect(asked).toEqual([['person-1', 'agent-writer']])
  })

  it("leaves a call on the sample's projects as written, and touches no space", async () => {
    const { asked, spaceFor } = spaces()
    const call = { toolName: 'get_task_details', input: { taskId: 'WEB-2' } }
    expect(await inOwnSpace([call], turn, spaceFor)).toEqual([call])
    expect(asked).toEqual([])
  })

  it('keeps the words for a turn that acts for no one, so the tool refuses the call', async () => {
    const { asked, spaceFor } = spaces()
    const call = { toolName: 'create_task', input: { projectId: OWN_SPACE, title: 'A', when: 'later' } }
    expect(await inOwnSpace([call], { personId: null, agentId: 'agent-writer' }, spaceFor)).toEqual([call])
    expect(asked).toEqual([])
  })
})
