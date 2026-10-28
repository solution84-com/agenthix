import { describe, it, expect, vi } from 'vitest'
import { recordedRepository } from '../repositoryHint'

function db(found: { session?: boolean; workspaceSkill?: boolean }) {
  return {
    agentSession: { findFirst: vi.fn(async () => (found.session ? { id: 's' } : null)) },
    placeSkill: { findFirst: vi.fn(async () => (found.workspaceSkill ? { id: 'p' } : null)) },
  }
}
const place = { placeType: 'project' as const, placeId: 'p1' }

describe('whether the picker offers the built-in given only in a repository, from hq\'s records @SC-1656', () => {
  it('is yes when the conversation\'s work ran in a workspace, or the place\'s last scan found a repository\'s skills', async () => {
    expect(await recordedRepository(db({ session: true }) as never, { conversationId: 'c1', place })()).toBe(true)
    expect(await recordedRepository(db({ workspaceSkill: true }) as never, { conversationId: null, place })()).toBe(true)
  })

  it('is no otherwise, and reads only the place\'s own rows', async () => {
    const d = db({})
    expect(await recordedRepository(d as never, { conversationId: 'c1', place })()).toBe(false)
    expect(d.placeSkill.findFirst).toHaveBeenCalledWith({ where: { ...place, group: 'WORKSPACE', goneAt: null }, select: { id: true } })
    expect(await recordedRepository(db({ workspaceSkill: true }) as never, { conversationId: 'c1', place: null })()).toBe(false)
  })
})
