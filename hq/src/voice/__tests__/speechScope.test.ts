import { describe, expect, it, vi } from 'vitest'

const placeOfConversation = vi.hoisted(() => vi.fn())
vi.mock('../../routing/place', () => ({ placeOfConversation }))

import { scopeOfConversation } from '../speechScope'

describe('scopeOfConversation', () => {
  it('costs speech to the conversation’s place, the person speaking and the conversation', async () => {
    placeOfConversation.mockResolvedValue({ kind: 'project', projectId: 'p1' })
    const ref = { id: 'c1', home: 'PROJECT' as const, projectId: 'p1', taskId: null, openedById: 'u2' }
    expect(await scopeOfConversation(ref, 'u1')).toEqual({ place: { kind: 'project', projectId: 'p1' }, userId: 'u1', conversationId: 'c1' })
    expect(placeOfConversation).toHaveBeenCalledWith(ref)
  })
})
