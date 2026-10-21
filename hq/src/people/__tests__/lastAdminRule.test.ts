import { describe, it, expect } from 'vitest'
import { isLastAdmin } from '@agenthix/ui/people'

type ProjectMember = { userId: string; username: string; role: 'ADMIN' | 'MEMBER' }

/**
 * No project may be left without an admin (spec §6.4). The server refuses the
 * write; this is the rule the members list uses to withhold the controls that
 * would attempt it, so the two cannot disagree.
 *
 * Tested as a rule rather than a render: `ui` has no test runner, and rendering
 * one of its components from hq's binds to the second React copy npm installs
 * into `ui/node_modules` for the peer dependency.
 */
const admin = (id: string): ProjectMember => ({ userId: id, username: id, role: 'ADMIN' })
const member = (id: string): ProjectMember => ({ userId: id, username: id, role: 'MEMBER' })

describe('isLastAdmin @SC-598', () => {
  it('is true for the only admin', () => {
    const list = [admin('a'), member('b')]
    expect(isLastAdmin(list, list[0])).toBe(true)
  })

  it('is false for an admin once a second one exists', () => {
    const list = [admin('a'), admin('b')]
    expect(isLastAdmin(list, list[0])).toBe(false)
    expect(isLastAdmin(list, list[1])).toBe(false)
  })

  it('is false for a plain member, however few admins there are', () => {
    const list = [admin('a'), member('b')]
    expect(isLastAdmin(list, list[1])).toBe(false)
  })

  it('is false for a member of a project with no admin at all — the rule withholds nothing it cannot fix', () => {
    const list = [member('a'), member('b')]
    expect(isLastAdmin(list, list[0])).toBe(false)
  })

  it('is true for the sole member when that member is the admin', () => {
    const list = [admin('a')]
    expect(isLastAdmin(list, list[0])).toBe(true)
  })
})
