import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codeWorkspaceMounts, copyContainerDir } from '../codeWorkspaceMounts'
import { buildContainerRunCommand } from '../containerRunArgs'
import { mountSignature } from '../mountSignature'
import type { AgentMounts, ContainerKey } from '../containerTypes'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ws-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

const boundary = () => ({ hostDir: path.join(root, 'projects', 'p1'), containerDir: '/projects/p1' })

describe('a code workspace\'s own folder is read-only to every run in its boundary @SC-1723', () => {
  beforeEach(() => { process.env.SITE_ROOT = root })
  const code = (owner: string, id: string) => path.join(root, 'code', 'projects', owner, id)
  const owner = { ownerType: 'project' as const, ownerId: 'p1' }

  it("each workspace whose main is in the code space is mounted read-only from there; the others are not (adr-0173)", async () => {
    for (const id of ['plain', 'code', 'own-git']) fs.mkdirSync(path.join(boundary().hostDir, 'workspaces', id), { recursive: true })
    fs.mkdirSync(path.join(code('p1', 'code'), '.git'), { recursive: true })
    // A `.git` a run made in the boundary does not make a workspace a repository.
    fs.mkdirSync(path.join(boundary().hostDir, 'workspaces', 'own-git', '.git'))
    const mounts = await codeWorkspaceMounts(boundary(), owner, [{ id: 'plain' }, { id: 'own-git' }, { id: 'code' }])
    expect(mounts).toEqual([{ hostDir: code('p1', 'code'), containerDir: '/projects/p1/workspaces/code' }])
    expect(copyContainerDir(boundary(), 'c1')).toBe('/projects/p1/clones/c1')
  })

  it('no mount source runs through the boundary, whatever a run replaced there with a link', async () => {
    const other = path.join(root, 'projects', 'p2', 'workspaces', 'secret')
    fs.mkdirSync(path.join(other, '.git'), { recursive: true })
    fs.mkdirSync(path.join(boundary().hostDir, 'workspaces'), { recursive: true })
    fs.symlinkSync(other, path.join(boundary().hostDir, 'workspaces', 'w1'))
    expect(await codeWorkspaceMounts(boundary(), owner, [{ id: 'w1' }])).toEqual([])
    fs.mkdirSync(path.join(code('p1', 'w2'), '.git'), { recursive: true })
    fs.rmSync(path.join(boundary().hostDir, 'workspaces'), { recursive: true })
    fs.symlinkSync(path.dirname(other), path.join(boundary().hostDir, 'workspaces'))
    const mounts = await codeWorkspaceMounts(boundary(), owner, [{ id: 'secret' }, { id: 'w2' }])
    expect(mounts.map(m => m.hostDir)).toEqual([code('p1', 'w2')])
    for (const m of mounts) expect(m.hostDir.startsWith(boundary().hostDir)).toBe(false)
  })

  it('the container binds them read-only over the boundary, and turning Git on changes its signature', () => {
    process.env.SITE_ROOT = root
    const key: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p1' } }
    const readOnly = [{ hostDir: `${boundary().hostDir}/workspaces/code`, containerDir: '/projects/p1/workspaces/code' }]
    const mounts: AgentMounts = { boundary: boundary(), folders: [], locationMode: 'rw', readOnly }
    const { args } = buildContainerRunCommand(key, { handle: 'a', runtime: 'opencode', sessionId: 's', credential: null }, 'c', mounts, 'net')
    const binds = args.filter((_, i) => args[i - 1] === '-v')
    expect(binds).toContain(`${boundary().hostDir}:/projects/p1:rw`)
    expect(binds).toContain(`${boundary().hostDir}/workspaces/code:/projects/p1/workspaces/code:ro`)
    expect(mountSignature(null, boundary(), 'rw', readOnly)).not.toBe(mountSignature(null, boundary(), 'rw', []))
  })
})

describe('what a run that is not code work is told of a code workspace\'s folder', () => {
  it('marks it as main, read-only, and changed only by work started in it, from a conversation or a task', async () => {
    const { markCodeWorkspaceFolders, CODE_WORKSPACE_FOLDER_NOTE } = await import('../codeWorkspaceMounts')
    const marked = markCodeWorkspaceFolders(
      [{ containerDir: '/projects/p1/workspaces/w1', description: 'workspace shop-app' }, { containerDir: '/projects/p1/files' }],
      [{ hostDir: '/h/w1', containerDir: '/projects/p1/workspaces/w1' }],
    )
    expect(marked[0]!.description).toBe(`workspace shop-app; ${CODE_WORKSPACE_FOLDER_NOTE}`)
    expect(marked[1]).toEqual({ containerDir: '/projects/p1/files' })
    expect(CODE_WORKSPACE_FOLDER_NOTE).toContain('`main`')
    expect(CODE_WORKSPACE_FOLDER_NOTE).toContain('read-only')
    expect(CODE_WORKSPACE_FOLDER_NOTE).toContain('work started in this workspace, from a conversation or as a task given it')
    expect(CODE_WORKSPACE_FOLDER_NOTE).not.toContain('started in the workspace')
  })
})
