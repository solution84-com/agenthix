import { describe, expect, it } from 'vitest'
import { workflowCard, type CardVersion } from '../card'
import { APPROVE_BY_TAP, workflowAnswerRefusal } from '../cardAnswer'

const version: CardVersion = {
  id: 'v2', number: 2, hash: 'a'.repeat(64), workflowId: 'w1', workflowName: 'deploy-staging',
  checkFlags: [{ rule: 9, high: true, message: 'This step runs code the agent can change after approval', path: 'steps[1].run', line: 1 }],
  checkSummary: 'Since version 1: changes what step 2 runs.',
  cardMayApprove: false,
  reviewLevel: 'LOOK_CLOSELY',
  reviewPoints: { points: [], note: 'The reviewer\'s answer couldn\'t be read.' },
}

describe('the workflow card @SC-1286', () => {
  it('carries the plain checks\' summary and flags, the reviewer\'s level, and the hash it shows', () => {
    expect(workflowCard(version, 'The plain checks raised a flag.')).toEqual({
      workflowId: 'w1', workflow: 'deploy-staging', version: 2, hash: 'a'.repeat(64),
      summary: 'Since version 1: changes what step 2 runs.',
      reviewLevel: 'look_closely', reviewNote: 'The reviewer\'s answer couldn\'t be read.',
      flags: [{ rule: 9, high: true, message: 'This step runs code the agent can change after approval', path: 'steps[1].run', line: 1 }],
      mayApprove: false, reason: 'The plain checks raised a flag.',
    })
  })

  it('offers Approve only from the stored card rule, whatever the reviewer said', () => {
    const low = { ...version, reviewLevel: 'LOW' as const, cardMayApprove: null }
    expect(workflowCard(low, null)).toMatchObject({ mayApprove: false, reason: 'The plain checks ask for the full review.' })
    const allowed = workflowCard({ ...version, checkFlags: [], cardMayApprove: true, reviewLevel: 'HIGH' }, null)
    expect(allowed.mayApprove).toBe(true)
    expect(allowed).not.toHaveProperty('reason')
  })
})

describe('who may answer a workflow card @SC-1280', () => {
  it('refuses an approval passed on by the agent, before anything is read', async () => {
    expect(await workflowAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'u1', 'turn')).toBe(APPROVE_BY_TAP)
  })
})
