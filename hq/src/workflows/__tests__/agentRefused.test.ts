import { describe, expect, it } from 'vitest'
import { approveWorkflowVersion, declineWorkflowVersion } from '../approve'
import { setWorkflowEnabled } from '../switch'
import { AGENT_REFUSAL, requireMayAdministerPlace, type WorkflowActor } from '../placeAccess'

// An agent is refused before anything is read: none of these reaches the database.
const agent: WorkflowActor = { kind: 'agent', agentId: 'agent-1', agentRunId: 'run-1', onBehalfOfUserId: 'user-1' }
const HASH = 'a'.repeat(64)

describe('an agent never approves, declines or switches', () => {
  it('is refused approving', async () => {
    await expect(approveWorkflowVersion({ workflowId: 'w', hash: HASH, via: 'card' }, agent)).rejects.toMatchObject({ statusCode: 403, message: AGENT_REFUSAL })
  })

  it('is refused declining', async () => {
    await expect(declineWorkflowVersion({ workflowId: 'w', hash: HASH }, agent)).rejects.toMatchObject({ statusCode: 403, message: AGENT_REFUSAL })
  })

  it('is refused switching on or off', async () => {
    await expect(setWorkflowEnabled('w', true, agent)).rejects.toMatchObject({ statusCode: 403 })
    await expect(setWorkflowEnabled('w', false, agent)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('is refused administering a place', async () => {
    await expect(requireMayAdministerPlace({ type: 'project', id: 'p' }, agent, 'Approving')).rejects.toMatchObject({ statusCode: 403 })
  })
})
