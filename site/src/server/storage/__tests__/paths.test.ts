// @vitest-environment node
/**
 * The storage layout, and the guard that keeps a crafted id inside it.
 *
 * This coverage lived in `hq/src/storage/__tests__/paths.test.ts` against hq's
 * copy of the layout. That copy is gone — hq names a location by its owner and
 * asks the site that holds it — so the tests moved here rather than going with
 * it: the implementation they exercise is this app's, and it is now the only
 * one.
 *
 * `getMemberDir` and `getArtefactsDir` matter most and are the reason this is
 * not a tidy-up. A person's own area inside a project is keyed by a user id and
 * an artefact set by an owner id, and both build a path by joining that id onto
 * a root; `assertSafeId` is the whole of what stops `../` in one of them
 * resolving outside the owner's storage. `locationContainment.ts` checks
 * containment for what arrives over the wire, but these two are reached from
 * inside the site — `agendaService.ts` for a member directory,
 * `locationContainment.ts` itself for an artefact set's base — so the guard
 * here is the first one, not a second opinion.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  locationDir,
  getFilesDir,
  getWorkspaceDir,
  getTaskDir,
  ownerDir,
  getMemberDir,
  getArtefactsDir,
} from '../paths'

const savedSiteRoot = process.env.SITE_ROOT

beforeEach(() => {
  process.env.SITE_ROOT = '/site'
})

afterEach(() => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
})

describe('a location resolves to a directory under its owner', () => {
  it('names an owner\'s own files, plural by owner kind', () => {
    expect(getFilesDir('project', 'p1')).toBe('/site/projects/p1/files')
    expect(getFilesDir('user', 'u1')).toBe('/site/users/u1/files')
  })

  it('names a workspace', () => {
    expect(getWorkspaceDir({ ownerType: 'project', ownerId: 'p1', id: 'ws1' }))
      .toBe('/site/projects/p1/workspaces/ws1')
    expect(locationDir({ ownerType: 'user', ownerId: 'u1', workspaceId: 'ws9' }))
      .toBe('/site/users/u1/workspaces/ws9')
  })

  it('names a task by its immutable id', () => {
    expect(locationDir({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-abc' }))
      .toBe('/site/projects/p1/tasks/task-uuid-abc')
    expect(getTaskDir('project', 'p1', 'task-uuid-abc'))
      .toBe(locationDir({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-abc' }))
  })

  it('takes taskId over workspaceId, so two derivations cannot disagree', () => {
    expect(locationDir({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-abc', workspaceId: 'ws1' }))
      .toBe('/site/projects/p1/tasks/task-uuid-abc')
  })

  it('separates two owners of the same kind, and two kinds of the same id', () => {
    expect(ownerDir('project', 'aaaa')).not.toBe(ownerDir('project', 'bbbb'))
    expect(getArtefactsDir('project', 'p1')).not.toBe(getArtefactsDir('user', 'p1'))
  })
})

describe('a person\'s own area inside a project', () => {
  it('sits under the project, keyed by the person', () => {
    expect(getMemberDir('p1', 'u1')).toBe('/site/projects/p1/members/u1')
    expect(getMemberDir('p1', 'u1')).not.toBe(getMemberDir('p1', 'u2'))
  })
})

describe('artefacts sit beside the owner\'s files, not inside them', () => {
  it('is a sibling of files/, per owner', () => {
    expect(getArtefactsDir('project', 'p1')).toBe('/site/projects/p1/artefacts')
    expect(getArtefactsDir('user', 'u1')).toBe('/site/users/u1/artefacts')
  })
})

describe('a crafted id cannot escape the location it names', () => {
  it('refuses an owner id that climbs out or is absolute', () => {
    expect(() => ownerDir('project', '../etc')).toThrow(/Unsafe/)
    expect(() => ownerDir('project', '/abs')).toThrow(/Unsafe/)
    expect(() => getFilesDir('project', '../etc')).toThrow(/Unsafe/)
  })

  it('refuses a workspace or task id that climbs out or is absolute', () => {
    expect(() => locationDir({ ownerType: 'project', ownerId: 'p1', workspaceId: '../x' })).toThrow(/Unsafe/)
    expect(() => locationDir({ ownerType: 'project', ownerId: 'p1', taskId: '../etc' })).toThrow(/Unsafe/)
    expect(() => locationDir({ ownerType: 'project', ownerId: 'p1', taskId: '/abs' })).toThrow(/Unsafe/)
    expect(() => getTaskDir('project', 'p1', '../../root')).toThrow(/Unsafe/)
  })

  it('refuses a member directory built from either crafted id', () => {
    // The user id is the one an agenda path joins on, and it is checked here
    // and nowhere before here.
    expect(() => getMemberDir('p1', '../etc')).toThrow(/Unsafe/)
    expect(() => getMemberDir('../etc', 'u1')).toThrow(/Unsafe/)
  })

  it('refuses an artefacts directory built from a crafted owner', () => {
    expect(() => getArtefactsDir('project', '../etc')).toThrow(/Unsafe/)
    expect(() => getArtefactsDir('user', '/abs')).toThrow(/Unsafe/)
  })
})
