/**
 * Unit tests for the boundary's one bind, the folders inside it, and the per-run
 * cwd (ADR-0074, ADR-0079).
 *
 * A container binds its STORAGE OWNER's folder whole. The folders listed for
 * the prompt — a project's files/, every workspace, tasks/ and members/; a
 * person's files/ and every workspace — are all inside that one bind. Nothing
 * about the run varies it. Knowledge is none of them: it lives outside the
 * owner's folder and runs reach it only through the knowledge tools.
 *
 * The cwd still varies per run, and is always a path INSIDE that set — never a
 * mount of its own. A task run's cwd points into the mounted tasks/ root.
 *
 * Severed (phase 5d-2): locationResolver.ts imports site's own
 * workspaceRows.ts (`getWorkspace`), which imports `#db` (the site's Prisma
 * client), so tests reaching this import chain mock it per-file (site's own
 * established convention, e.g. dataClient.test.ts). Neither function under test touches prisma — this is
 * here only to satisfy the module load.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))

import {
  resolveAccessibleLocations,
  resolveBoundaryMount,
  resolvePrimaryContainerDir,
  resolveAgendaContainerPath,
  type StorageOwner,
} from '../locationResolver'
import path from 'node:path'
import {
  getArtefactsDir, getFilesDir, getKnowledgeDir, getMemberDir, getTaskDir, getWorkspaceDir,
} from '../../../server/storage/paths'
import type { LocationRef } from '../../../server/storage/paths'

const SITE = '/home/deploy/site'

// The storage-path module reads SITE_ROOT at call time. Pointing it at the same
// root the mount set is built against is what lets the two be compared directly
// rather than both against a literal — see the artefacts pin below.
const savedSiteRoot = process.env.SITE_ROOT
beforeAll(() => { process.env.SITE_ROOT = SITE })
afterAll(() => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
})

const PROJECT: StorageOwner = { ownerType: 'project', ownerId: 'proj-uuid', name: 'My project' }
const PERSON: StorageOwner = { ownerType: 'user', ownerId: 'user-uuid-1' }

const WORKSPACES = [
  { id: 'ws-uuid-a', name: 'design' },
  { id: 'ws-uuid-b', name: 'backend' },
]

function dirs(owner: StorageOwner, workspaces = WORKSPACES): string[] {
  return resolveAccessibleLocations(owner, SITE, workspaces).map(l => l.containerDir)
}

// ── the set is a function of the owner ───────────────────────────────────────

describe('resolveAccessibleLocations — a project\'s storage', () => {
  it('mounts files, artefacts, every workspace, the tasks root and the members root', () => {
    expect(new Set(dirs(PROJECT))).toEqual(new Set([
      '/projects/proj-uuid/files',
      '/projects/proj-uuid/artefacts',
      '/projects/proj-uuid/workspaces/ws-uuid-a',
      '/projects/proj-uuid/workspaces/ws-uuid-b',
      '/projects/proj-uuid/tasks',
      '/projects/proj-uuid/members',
    ]))
  })

  it('mounts the artefacts root, so the run can write what hq serves back', () => {
    // The agent used to write these inside its own workspace, the one directory
    // it had. They belong to whoever the work was done for, so the run reaches
    // them the same way it reaches the rest of that owner's storage.
    //
    // Compared against what the storage-path module PRODUCES, not against a
    // literal: this function composes its host paths itself, from its own
    // segment strings, and hq reads the same directory through that module. A
    // literal on both sides would let the two spellings be changed apart — the
    // run writing one name while hq reads another — with every test still
    // green. Files, workspaces, members and tasks are pinned the same
    // way below.
    const locations = resolveAccessibleLocations(PROJECT, SITE, [])
    const artefacts = locations.find(l => l.containerDir === '/projects/proj-uuid/artefacts')!
    expect(artefacts.hostDir).toBe(getArtefactsDir('project', 'proj-uuid'))
  })

  it('tells the agent to save each artefact as one file directly in artefacts/, and to link to it in its reply', () => {
    const artefacts = resolveAccessibleLocations(PROJECT, SITE, []).find(l => l.containerDir === '/projects/proj-uuid/artefacts')!
    expect(artefacts.description).toMatch(/one file/)
    expect(artefacts.description).toMatch(/no subfolder/)
    expect(artefacts.description).toContain('[title](artefacts/<file name>)')
    expect(artefacts.description).not.toMatch(/set/)
  })

  it('lists no knowledge folder, and the knowledge root is outside the bind @SC-1384', () => {
    for (const owner of [PROJECT, PERSON]) {
      const locations = resolveAccessibleLocations(owner, SITE, [])
      expect(locations.some(l => l.containerDir.endsWith('/knowledge'))).toBe(false)
      const bind = resolveBoundaryMount(owner, SITE)
      const knowledge = getKnowledgeDir(owner.ownerType, owner.ownerId)
      expect(knowledge === bind.hostDir || knowledge.startsWith(`${bind.hostDir}/`)).toBe(false)
    }
  })

  it('mounts the members root, never one person\'s area', () => {
    // Same shape as the tasks root, and for the same reason: the set is a
    // function of the owner alone, so it cannot carry a per-run, per-person
    // bind. A person's area is a path inside the root.
    const locations = resolveAccessibleLocations(PROJECT, SITE, [])
    const members = locations.find(l => l.containerDir === '/projects/proj-uuid/members')!
    // The root, so the parent of any one member's area.
    expect(members.hostDir).toBe(path.dirname(getMemberDir('proj-uuid', 'any-user')))
    expect(locations.some(l => l.containerDir.startsWith('/projects/proj-uuid/members/'))).toBe(false)
  })

  it('mounts the tasks root, never one task directory', () => {
    const locations = resolveAccessibleLocations(PROJECT, SITE, [])
    const tasks = locations.find(l => l.containerDir === '/projects/proj-uuid/tasks')!
    expect(tasks.hostDir).toBe(path.dirname(getTaskDir('project', 'proj-uuid', 'any-task')))
    expect(locations.some(l => l.containerDir.startsWith('/projects/proj-uuid/tasks/'))).toBe(false)
  })

  it('both sides of every bind are id-keyed — the container path is the site path without its root (ADR-0074)', () => {
    const locations = resolveAccessibleLocations(PROJECT, SITE, WORKSPACES)
    const files = locations.find(l => l.containerDir === '/projects/proj-uuid/files')!
    expect(files.hostDir).toBe(getFilesDir('project', 'proj-uuid'))
    const ws = locations.find(l => l.containerDir === '/projects/proj-uuid/workspaces/ws-uuid-a')!
    expect(ws.hostDir).toBe(getWorkspaceDir({ ownerType: 'project', ownerId: 'proj-uuid', id: 'ws-uuid-a' }))
    for (const l of locations) expect(l.hostDir).toBe(`${SITE}${l.containerDir}`)
  })

  it('renaming the project or a workspace changes no container path — only the names the prompt prints', () => {
    const before = resolveAccessibleLocations(PROJECT, SITE, WORKSPACES)
    const after = resolveAccessibleLocations(
      { ...PROJECT, name: 'Renamed project' },
      SITE,
      WORKSPACES.map(ws => ({ ...ws, name: `${ws.name} renamed` })),
    )
    expect(after.map(l => l.containerDir)).toEqual(before.map(l => l.containerDir))
    expect(after.map(l => l.hostDir)).toEqual(before.map(l => l.hostDir))
    expect(after.find(l => l.containerDir.endsWith('/files'))!.description).toContain('"Renamed project"')
    expect(after.find(l => l.containerDir.endsWith('/workspaces/ws-uuid-a'))!.description).toBe('workspace "design renamed"')
    // The cwd takes no name at all.
    const cwd = resolvePrimaryContainerDir({ ownerType: 'project', ownerId: 'proj-uuid', workspaceId: 'ws-uuid-a' })
    expect(cwd).toBe('/projects/proj-uuid/workspaces/ws-uuid-a')
  })

  it('tells the agent each workspace\'s and the project\'s current name', () => {
    const locations = resolveAccessibleLocations(PROJECT, SITE, WORKSPACES)
    expect(locations.find(l => l.containerDir === '/projects/proj-uuid/files')!.description)
      .toBe('files of the project currently named "My project"')
    expect(locations.find(l => l.containerDir === '/projects/proj-uuid/workspaces/ws-uuid-b')!.description)
      .toBe('workspace "backend"')
  })

  it('every mount belongs to that one owner and no other', () => {
    for (const l of resolveAccessibleLocations(PROJECT, SITE, WORKSPACES)) {
      expect(l.containerDir, `${l.containerDir} belongs to another owner`).toMatch(/^\/projects\/proj-uuid\//)
      expect(l.hostDir, `${l.hostDir} belongs to another owner`).toMatch(/^\/home\/deploy\/site\/projects\/proj-uuid\//)
    }
  })

  // "The set does not vary with the run" is NOT asserted here: this function
  // takes no run, so nothing at this level could distinguish one. It is pinned
  // end to end instead, in AgentEngine.workspaceMounts.test.ts, by running a
  // real chat turn and a real task run in one project and comparing what each
  // hands the container manager.

  it('lists every workspace the owner has — there is no per-workspace exclusion any more (ADR-0079)', () => {
    const listed = dirs(PROJECT, WORKSPACES)
    expect(listed).toContain('/projects/proj-uuid/workspaces/ws-uuid-a')
    expect(listed).toContain('/projects/proj-uuid/workspaces/ws-uuid-b')
  })

  it('binds the whole boundary once, and every listed folder is inside that bind', () => {
    const bind = resolveBoundaryMount(PROJECT, SITE)
    expect(bind).toEqual({ hostDir: `${SITE}/projects/proj-uuid`, containerDir: '/projects/proj-uuid' })
    for (const l of resolveAccessibleLocations(PROJECT, SITE, WORKSPACES)) {
      expect(l.containerDir.startsWith(`${bind.containerDir}/`)).toBe(true)
      expect(l.hostDir.startsWith(`${bind.hostDir}/`)).toBe(true)
    }
  })

  it('emits no duplicate containerDir, even given a repeated workspace row', () => {
    const mounted = dirs(PROJECT, [WORKSPACES[0], WORKSPACES[0]])
    expect(mounted.length).toBe(new Set(mounted).size)
  })
})

describe('resolveAccessibleLocations — a person\'s own storage', () => {
  it('mounts files and every workspace', () => {
    const mounted = dirs(PERSON, [{ id: 'ws-uuid-c', name: 'notes' }])
    expect(mounted).toContain('/users/user-uuid-1/files')
    expect(mounted).toContain('/users/user-uuid-1/workspaces/ws-uuid-c')
  })

  it('describes the tasks root of their personal project, whose tasks run here (agents own schedule spec §4)', () => {
    expect(dirs(PERSON, [])).toContain('/users/user-uuid-1/tasks')
  })

  it('mounts no members root — a person\'s own storage is shared with nobody', () => {
    // Positive anchor: the set is real and has the mounts a person does get,
    // so this cannot pass merely because nothing was mounted at all.
    expect(dirs(PERSON, [])).toContain('/users/user-uuid-1/files')
    expect(dirs(PERSON, [])).not.toContain('/users/user-uuid-1/members')
  })

  it('mounts artefacts in a person\'s own storage too', () => {
    const locations = resolveAccessibleLocations(PERSON, SITE, [])
    const artefacts = locations.find(l => l.containerDir === '/users/user-uuid-1/artefacts')!
    expect(artefacts.hostDir).toBe(getArtefactsDir('user', 'user-uuid-1'))
  })

  it('lists no knowledge folder in a person\'s own space either @SC-1384', () => {
    expect(dirs(PERSON, [])).not.toContain('/users/user-uuid-1/knowledge')
  })
})

// ── the cwd varies per run, inside the owner's set ───────────────────────────

describe('resolvePrimaryContainerDir — the cwd is a path inside the owner\'s set', () => {
  function inSet(cwd: string, owner: StorageOwner, workspaces = WORKSPACES): boolean {
    return resolveAccessibleLocations(owner, SITE, workspaces)
      .some(l => cwd === l.containerDir || cwd.startsWith(`${l.containerDir}/`))
  }

  it('a files run works in the owner\'s files home', () => {
    const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-uuid' }
    const cwd = resolvePrimaryContainerDir(loc)
    expect(cwd).toBe('/projects/proj-uuid/files')
    expect(inSet(cwd, PROJECT)).toBe(true)
  })

  it('a workspace run works in that workspace', () => {
    const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-uuid', workspaceId: 'ws-uuid-a' }
    const cwd = resolvePrimaryContainerDir(loc)
    expect(cwd).toBe('/projects/proj-uuid/workspaces/ws-uuid-a')
    expect(inSet(cwd, PROJECT)).toBe(true)
  })

  it('a task run works inside the mounted tasks root, not in a mount of its own', () => {
    const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-uuid', taskId: 'task-uuid-1' }
    const cwd = resolvePrimaryContainerDir(loc)
    expect(cwd).toBe('/projects/proj-uuid/tasks/task-uuid-1')
    expect(inSet(cwd, PROJECT)).toBe(true)
    // It is a path within the tasks root, never a bind target itself.
    expect(resolveAccessibleLocations(PROJECT, SITE, WORKSPACES).map(l => l.containerDir)).not.toContain(cwd)
  })

  it("a personal project's task works in tasks/<taskId> of its person's own storage, inside their set", () => {
    const loc: LocationRef = { ownerType: 'user', ownerId: 'user-uuid-1', taskId: 'task-uuid-1' }
    const cwd = resolvePrimaryContainerDir(loc)
    expect(cwd).toBe('/users/user-uuid-1/tasks/task-uuid-1')
    expect(inSet(cwd, PERSON)).toBe(true)
  })

  it('a person\'s own files run works in their files home', () => {
    const loc: LocationRef = { ownerType: 'user', ownerId: 'user-uuid-1' }
    const cwd = resolvePrimaryContainerDir(loc)
    expect(cwd).toBe('/users/user-uuid-1/files')
    expect(inSet(cwd, PERSON, [])).toBe(true)
  })
})

// ── the agenda is reachable from the run (close-out spec §6.1) ───────────────

describe('the agenda path the prompt renders', () => {
  function inSet(p: string, owner: StorageOwner, workspaces = WORKSPACES): boolean {
    return resolveAccessibleLocations(owner, SITE, workspaces)
      .some(l => p === l.containerDir || p.startsWith(`${l.containerDir}/`))
  }

  it('is one the run can actually reach, in a project', () => {
    // This is the repair. The agenda used to be named as a sibling of the
    // agent's workspace, which is the only directory a container binds, so the
    // path in the prompt opened nothing. Anchored on the mount set being real.
    const agenda = resolveAgendaContainerPath(PROJECT, 'user-uuid-1')
    expect(agenda).toBe('/projects/proj-uuid/members/user-uuid-1/agenda.md')
    expect(resolveAccessibleLocations(PROJECT, SITE, WORKSPACES).length).toBeGreaterThan(0)
    expect(inSet(agenda, PROJECT)).toBe(true)
  })

  it('is one the run can actually reach, in a person\'s own space', () => {
    const agenda = resolveAgendaContainerPath(PERSON, 'user-uuid-1')
    expect(agenda).toBe('/users/user-uuid-1/files/agenda.md')
    expect(resolveAccessibleLocations(PERSON, SITE, []).length).toBeGreaterThan(0)
    expect(inSet(agenda, PERSON, [])).toBe(true)
  })

  it('gives two people in one project separate agendas, both inside the mount', () => {
    const mine = resolveAgendaContainerPath(PROJECT, 'user-uuid-1')
    const theirs = resolveAgendaContainerPath(PROJECT, 'user-uuid-2')
    expect(mine).not.toBe(theirs)
    expect(inSet(mine, PROJECT)).toBe(true)
    expect(inSet(theirs, PROJECT)).toBe(true)
  })

  it('names no agent — one person has one agenda per boundary', () => {
    // The function takes no agent, and the path carries no segment that could
    // hold one: the only things between the owner and the file are the members
    // root and the person.
    expect(resolveAgendaContainerPath(PROJECT, 'user-uuid-1').split('/'))
      .toEqual(['', 'projects', 'proj-uuid', 'members', 'user-uuid-1', 'agenda.md'])
  })
})
