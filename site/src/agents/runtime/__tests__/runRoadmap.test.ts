/**
 * The roadmap path a task run's prompt prints must name the project's own
 * `files/ROADMAP.md` as the RUN sees it: inside the mounted `files` directory
 * under container isolation, and on this machine's disk without it. Asserted
 * against the mount set itself rather than a spelled-out string alone, so a
 * change to the mount layout that this path did not follow fails here.
 *
 * `#db` is mocked for the module load only — locationResolver imports
 * workspaceRows, which imports it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))

import path from 'node:path'
import { resolveRunRoadmapPath } from '../runRoadmap'
import { resolveAccessibleLocations } from '../locationResolver'

const saved = { root: process.env.SITE_ROOT, isolation: process.env.AGENT_CONTAINER_ISOLATION }

beforeEach(() => { process.env.SITE_ROOT = '/srv/site' })
afterEach(() => {
  if (saved.root === undefined) delete process.env.SITE_ROOT; else process.env.SITE_ROOT = saved.root
  if (saved.isolation === undefined) delete process.env.AGENT_CONTAINER_ISOLATION
  else process.env.AGENT_CONTAINER_ISOLATION = saved.isolation
})

function filesMount() {
  const mounts = resolveAccessibleLocations({ ownerType: 'project', ownerId: 'proj-uuid', name: 'web-app' }, '/srv/site', [])
  const files = mounts.find(m => m.containerDir.endsWith('/files'))
  if (!files) throw new Error('no files mount in the project mount set')
  return files
}

describe('resolveRunRoadmapPath', () => {
  it('under container isolation, names ROADMAP.md inside the mounted project files', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    const roadmap = resolveRunRoadmapPath({ ownerType: 'project', ownerId: 'proj-uuid' })
    expect(roadmap).toBe('/projects/proj-uuid/files/ROADMAP.md')
    expect(path.posix.dirname(roadmap)).toBe(filesMount().containerDir)
  })

  it('without container isolation, names ROADMAP.md in the project files on this site\'s disk', () => {
    delete process.env.AGENT_CONTAINER_ISOLATION
    const roadmap = resolveRunRoadmapPath({ ownerType: 'project', ownerId: 'proj-uuid' })
    expect(roadmap).toBe(path.join('/srv/site', 'projects', 'proj-uuid', 'files', 'ROADMAP.md'))
    expect(path.dirname(roadmap)).toBe(filesMount().hostDir)
  })
  it("names a person's own files for a task in their personal project, never a project's", () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    expect(resolveRunRoadmapPath({ ownerType: 'user', ownerId: 'person-uuid' })).toBe('/users/person-uuid/files/ROADMAP.md')
    delete process.env.AGENT_CONTAINER_ISOLATION
    expect(resolveRunRoadmapPath({ ownerType: 'user', ownerId: 'person-uuid' }))
      .toBe(path.join('/srv/site', 'users', 'person-uuid', 'files', 'ROADMAP.md'))
  })
})
