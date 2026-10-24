/** No tool an agent has approves, declines or switches a workflow (spec part 1, *R4 · Who approves*, *On and off*). */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))
vi.mock('../../sessions/siteRuntimeStore', () => ({}))
vi.mock('../../server/controlplane/runOnBehalfOf', () => ({ personOfRun: vi.fn() }))
vi.mock('../library', () => ({}))
vi.mock('../propose', () => ({ proposeWorkflowVersion: vi.fn() }))
vi.mock('../runs', () => ({ startWorkflowRun: vi.fn() }))
vi.mock('../runsEvents', () => ({ refreshRunFromSite: vi.fn() }))
vi.mock('../runsLive', () => ({ waitForRunEnd: vi.fn() }))
vi.mock('../runsView', () => ({}))
vi.mock('../placeAccess', () => ({}))

import { WORKFLOW_TOOL_NAMES } from '@agenthix/core'
import { WORKFLOW_TOOL_OPERATIONS } from '../agentTools'
import { WORKFLOW_TOOL_SCHEMAS } from '../agentToolsSchemas'

describe("the agent's workflow tools", () => {
  it('are exactly the four core declares, with a schema each', () => {
    const names = Object.values(WORKFLOW_TOOL_NAMES).sort()
    expect(Object.keys(WORKFLOW_TOOL_OPERATIONS).sort()).toEqual(names)
    expect(WORKFLOW_TOOL_SCHEMAS.map((s) => s.name).sort()).toEqual(names)
  })

  it('reach neither approving nor switching', () => {
    const source = readFileSync(path.resolve(__dirname, '../agentTools.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(approve|switch|actions)'/)
    expect(source).not.toMatch(/approveWorkflowVersion|declineWorkflowVersion|setWorkflowEnabled|turnOffWorkflows/)
  })

  it('refuse a caller that is not an agent run', async () => {
    await expect(WORKFLOW_TOOL_OPERATIONS.run_workflow({ kind: 'connection' } as any, { name: 'push', runId: 'r' }))
      .rejects.toMatchObject({ code: 'forbidden' })
  })
})
