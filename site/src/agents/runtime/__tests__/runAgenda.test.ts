/**
 * `resolveRunAgenda` is the one function that decides, per run, whose agenda
 * and in which form — and its two path builders are separate implementations of
 * the same rule: `getAgendaFilePath` builds the host path from the storage-paths
 * module, `resolveAgendaContainerPath` builds the container path from the mount
 * base. Nothing else asserts they name the same file, so changing one branch
 * alone would leave the other green: onboarding would seed one path and the run
 * would read another, with both apps type-checking and testing clean.
 *
 * `#db` is mocked for the module load only — locationResolver imports
 * workspaceRows, which imports it. Nothing under test touches prisma. Site's own
 * per-file convention, as in AgentEngine.resolveLocations.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))

import path from 'node:path'
import { resolveRunAgenda, resolveAgendaContainerPath, type StorageOwner } from '../locationResolver'
import { getAgendaFilePath } from '../../agendaService'
import { ownerDir, type LocationRef } from '../../../server/storage/paths'

const PROJECT_LOC: LocationRef = { ownerType: 'project', ownerId: 'proj-uuid' }
const OWN_LOC: LocationRef = { ownerType: 'user', ownerId: 'user-uuid-1' }
const PROJECT: StorageOwner = { ownerType: 'project', ownerId: 'proj-uuid', name: 'My project' }
const PERSON: StorageOwner = { ownerType: 'user', ownerId: 'user-uuid-1' }

const savedRoot = process.env.SITE_ROOT
const savedIsolation = process.env.AGENT_CONTAINER_ISOLATION

beforeEach(() => { process.env.SITE_ROOT = '/site' })
afterEach(() => {
  if (savedRoot === undefined) delete process.env.SITE_ROOT; else process.env.SITE_ROOT = savedRoot
  if (savedIsolation === undefined) delete process.env.AGENT_CONTAINER_ISOLATION
  else process.env.AGENT_CONTAINER_ISOLATION = savedIsolation
})

/** What the two builders each put between the owner's own root and the file. */
function hostTail(loc: LocationRef, userId: string): string[] {
  return path
    .relative(ownerDir(loc.ownerType, loc.ownerId), getAgendaFilePath(loc, userId))
    .split(path.sep)
}
function containerTail(owner: StorageOwner, userId: string): string[] {
  const base = owner.ownerType === 'project' ? '/projects/proj-uuid/' : '/users/user-uuid-1/'
  const full = resolveAgendaContainerPath(owner, userId)
  expect(full.startsWith(base)).toBe(true)
  return full.slice(base.length).split('/')
}

describe('the host and container agenda paths name the same file', () => {
  it('agree in a project', () => {
    expect(hostTail(PROJECT_LOC, 'user-uuid-1')).toEqual(['members', 'user-uuid-1', 'agenda.md'])
    expect(containerTail(PROJECT, 'user-uuid-1')).toEqual(hostTail(PROJECT_LOC, 'user-uuid-1'))
  })

  it('agree in a person\'s own space', () => {
    expect(hostTail(OWN_LOC, 'user-uuid-1')).toEqual(['files', 'agenda.md'])
    expect(containerTail(PERSON, 'user-uuid-1')).toEqual(hostTail(OWN_LOC, 'user-uuid-1'))
  })

  it('disagree for no owner kind — the rule is one rule, written twice', () => {
    // Both kinds in one assertion: a branch changed on one side and not the
    // other fails here even if its own builder's test was updated to match.
    expect([containerTail(PROJECT, 'user-uuid-1'), containerTail(PERSON, 'user-uuid-1')])
      .toEqual([hostTail(PROJECT_LOC, 'user-uuid-1'), hostTail(OWN_LOC, 'user-uuid-1')])
  })
})

describe('resolveRunAgenda', () => {
  it('pairs the host path with the container path when the run is isolated', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    expect(resolveRunAgenda(PROJECT_LOC, 'user-uuid-1')).toEqual({
      hostPath: '/site/projects/proj-uuid/members/user-uuid-1/agenda.md',
      visiblePath: '/projects/proj-uuid/members/user-uuid-1/agenda.md',
    })
  })

  it('pairs a person\'s own space the same way', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    expect(resolveRunAgenda(OWN_LOC, 'user-uuid-1')).toEqual({
      hostPath: '/site/users/user-uuid-1/files/agenda.md',
      visiblePath: '/users/user-uuid-1/files/agenda.md',
    })
  })

  it('shows the run the host path when there is no container', () => {
    delete process.env.AGENT_CONTAINER_ISOLATION
    const agenda = resolveRunAgenda(PROJECT_LOC, 'user-uuid-1')!
    expect(agenda.visiblePath).toBe(agenda.hostPath)
    expect(agenda.hostPath).toBe('/site/projects/proj-uuid/members/user-uuid-1/agenda.md')
  })

  it('returns nothing for a person with no area in that storage', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    // Anchored on the owner themselves resolving, so this cannot pass merely
    // because the function returns null for everything.
    expect(resolveRunAgenda(OWN_LOC, 'user-uuid-1')).not.toBeNull()
    expect(resolveRunAgenda(OWN_LOC, 'user-uuid-2')).toBeNull()
  })

  it('names the same container path by id, whatever the project is called', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    // No name is an input any more: a rename cannot move the agenda.
    const renamed: StorageOwner = { ...PROJECT, name: 'Renamed' }
    expect(resolveRunAgenda(PROJECT_LOC, 'user-uuid-1')!.visiblePath)
      .toBe(resolveAgendaContainerPath(renamed, 'user-uuid-1'))
  })
})
