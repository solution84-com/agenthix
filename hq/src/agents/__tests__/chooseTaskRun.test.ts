/**
 * Which model a task's run asks the resolver for (models from one place, part 4): a model the person's words named for
 * this run, then the task's own, each a fixed pick; with neither, a run a conversation asked for takes that
 * conversation's model first, as a default that falls through; with no conversation behind it, the defaults.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runModel = vi.hoisted(() => ({
  chooseBoundaryRun: vi.fn(async () => ({ model: 'm', runtime: 'claude-sdk', resolution: null, problem: null })),
  chooseKeptSessionRun: vi.fn(),
}))
vi.mock('../runModel', () => runModel)

import { chooseTaskRun } from '../taskRunModel'

const boundary = { type: 'project' as const, id: 'pr1' }
const agent = { id: 'a1' }
const named = { providerId: 'p-or', model: 'deepseek/deepseek-v3.2' }

beforeEach(() => vi.clearAllMocks())

describe("a task's run model @SC-955", () => {
  it("1. a model the person's words named for this run wins over the task's own", async () => {
    await chooseTaskRun(boundary, agent, 'u1', 'p-ant/claude-opus-5', { pick: named, conversationId: 'c1' })
    expect(runModel.chooseBoundaryRun).toHaveBeenCalledWith(boundary, 'a1', 'u1', named, null)
  })

  it("2. the task's own model wins over the conversation's", async () => {
    await chooseTaskRun(boundary, agent, 'u1', 'p-ant/claude-opus-5', { pick: null, conversationId: 'c1' })
    expect(runModel.chooseBoundaryRun).toHaveBeenCalledWith(boundary, 'a1', 'u1', { providerId: 'p-ant', model: 'claude-opus-5' }, null)
  })

  it("3. a task with no model of its own, run from a conversation, takes the conversation's model for this run", async () => {
    await chooseTaskRun(boundary, agent, 'u1', null, { pick: null, conversationId: 'c1' })
    expect(runModel.chooseBoundaryRun).toHaveBeenCalledWith(boundary, 'a1', 'u1', null, 'c1')
  })

  it('4. a run with no conversation behind it takes the defaults', async () => {
    await chooseTaskRun(boundary, agent, 'u1', null, null)
    expect(runModel.chooseBoundaryRun).toHaveBeenCalledWith(boundary, 'a1', 'u1', null, null)
  })
})
