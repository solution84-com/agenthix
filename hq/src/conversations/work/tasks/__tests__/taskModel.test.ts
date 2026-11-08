/**
 * The model a task the lead creates is stored with (models from one place, part 4): the one the person's words named,
 * checked; else the conversation's own when it may run in the task's project; else none, which follows the defaults.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  conversation: null as null | { talkingProviderId: string | null; talkingModel: string | null },
  checked: vi.fn(async (raw: unknown) => raw as string),
}))
vi.mock('wasp/server', () => {
  class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } }
  return { HttpError, prisma: { conversation: { findUnique: async () => h.conversation } } }
})
vi.mock('../../../../models-settings/taskModelChoice', () => ({ checkedTaskModel: h.checked }))
vi.mock('../../../access/talkingModel', () => ({
  choiceValue: (c: { providerId: string; model: string }) => `${c.providerId}/${c.model}`,
  parseChoiceValue: () => null,
}))
vi.mock('../../../sealing', () => ({ openJson: (s: string) => JSON.parse(s) }))

import { HttpError } from 'wasp/server'
import { modelForCreatedTask } from '../taskModel'

const base = { conversationId: 'c1', projectId: 'pr1', agentId: 'a1', userId: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  h.conversation = { talkingProviderId: 'p-ant', talkingModel: 'claude-sonnet-5' }
  h.checked.mockImplementation(async (raw: unknown) => raw as string)
})

describe('a task the lead creates @SC-955', () => {
  it("1. keeps the model the person's words named, checked in the task's project", async () => {
    expect(await modelForCreatedTask({ ...base, named: 'p-or/deepseek/deepseek-v3.2' })).toBe('p-or/deepseek/deepseek-v3.2')
    expect(h.checked).toHaveBeenCalledWith('p-or/deepseek/deepseek-v3.2', { projectId: 'pr1', agentId: 'a1', userId: 'u1' })
  })

  it('1. refuses a named model that may not run there, so no task is made on it', async () => {
    h.checked.mockRejectedValueOnce(new HttpError(400, 'That model is not one the lists here allow'))
    await expect(modelForCreatedTask({ ...base, named: 'p-or/x' })).rejects.toThrow('lists here allow')
  })

  it("3. takes the conversation's current model as its own when none is named", async () => {
    expect(await modelForCreatedTask({ ...base, named: undefined })).toBe('p-ant/claude-sonnet-5')
  })

  it("3. follows the defaults when the conversation's model may not run in the task's project, or there is none yet", async () => {
    h.checked.mockRejectedValueOnce(new HttpError(400, 'not allowed'))
    expect(await modelForCreatedTask({ ...base, named: undefined })).toBeNull()
    h.conversation = { talkingProviderId: null, talkingModel: null }
    expect(await modelForCreatedTask({ ...base, named: undefined })).toBeNull()
  })
})
