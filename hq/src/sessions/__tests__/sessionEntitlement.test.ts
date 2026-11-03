import { describe, it, expect } from 'vitest'
import { sessionsInEntitledProjects } from '../sessionEntitlement'
import { isRunVisible } from '../runReadHelpers'

// The two pure rules behind a session's reach: the listing filter and the run
// feed's visibility check. Who may act on or read a session, against the real
// database, is in sessionControl, sessionRunAccess and sessionReads
// .integration.test.ts.

const OWNER = 'usr_owner'
const ORG_ADMIN = 'usr_org_admin'
const ORPHANED_PERSONAL = {
  id: 's-mine', taskId: null, userId: OWNER, sessionType: 'task', primaryOwnerType: 'user', primaryOwnerId: OWNER,
}

describe("a personal project's task session whose task is gone", () => {
  it('is listed for nobody but its person', () => {
    const where = sessionsInEntitledProjects(ORG_ADMIN)
    expect(where.OR).toContainEqual({ taskId: null, primaryOwnerType: 'user', primaryOwnerId: ORG_ADMIN })
    expect(where.OR).not.toContainEqual({ taskId: null })
  })

  it('has its runs visible in a run feed to its person only', () => {
    const session = { title: null, ...ORPHANED_PERSONAL }
    expect(isRunVisible(session, OWNER, new Set())).toBe(true)
    expect(isRunVisible(session, ORG_ADMIN, new Set())).toBe(false)
  })
})

describe('a task session whose task is gone, in no person\'s own storage', () => {
  const ORPHANED = { id: 's-o', title: null, userId: 'usr_routing_admin', sessionType: 'task', taskId: null }

  it('has its runs visible to nobody, the routing admin it names included', () => {
    expect(isRunVisible(ORPHANED, ORG_ADMIN, new Set())).toBe(false)
    expect(isRunVisible(ORPHANED, 'usr_routing_admin', new Set())).toBe(false)
    expect(isRunVisible({ ...ORPHANED, primaryOwnerType: 'project', primaryOwnerId: 'p1' }, ORG_ADMIN, new Set(['p1']))).toBe(false)
  })

  it('is listed for nobody', () => {
    const where = sessionsInEntitledProjects(ORG_ADMIN)
    expect(where.OR).not.toContainEqual({ taskId: null, primaryOwnerType: null })
    expect(where.OR).not.toContainEqual({ taskId: null, primaryOwnerType: 'project' })
    expect(where.OR).toContainEqual({ taskId: null, sessionType: 'chat' })
  })
})
