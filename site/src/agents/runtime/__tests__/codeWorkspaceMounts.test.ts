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
  it('each workspace whose folder holds a .git is bound read-only; the others are not', async () => {
    for (const id of ['plain', 'code', 'linked']) fs.mkdirSync(path.join(boundary().hostDir, 'workspaces', id), { recursive: true })
    fs.mkdirSync(path.join(boundary().hostDir, 'workspaces', 'code', '.git'))
    fs.writeFileSync(path.join(boundary().hostDir, 'workspaces', 'linked', '.git'), 'gitdir: /elsewhere\n')
    const mounts = await codeWorkspaceMounts(boundary(), [{ id: 'plain' }, { id: 'linked' }, { id: 'code' }])
    expect(mounts).toEqual([
      { hostDir: `${boundary().hostDir}/workspaces/code`, containerDir: '/projects/p1/workspaces/code' },
      { hostDir: `${boundary().hostDir}/workspaces/linked`, containerDir: '/projects/p1/workspaces/linked' },
    ])
    expect(copyContainerDir(boundary(), 'c1')).toBe('/projects/p1/clones/c1')
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
  it('marks it as main, read-only, and changed only by a task given it or a conversation started in it', async () => {
    const { markCodeWorkspaceFolders, CODE_WORKSPACE_FOLDER_NOTE } = await import('../codeWorkspaceMounts')
    const marked = markCodeWorkspaceFolders(
      [{ containerDir: '/projects/p1/workspaces/w1', description: 'workspace shop-app' }, { containerDir: '/projects/p1/files' }],
      [{ hostDir: '/h/w1', containerDir: '/projects/p1/workspaces/w1' }],
    )
    expect(marked[0]!.description).toBe(`workspace shop-app; ${CODE_WORKSPACE_FOLDER_NOTE}`)
    expect(marked[1]).toEqual({ containerDir: '/projects/p1/files' })
    expect(CODE_WORKSPACE_FOLDER_NOTE).toContain('`main`')
    expect(CODE_WORKSPACE_FOLDER_NOTE).toContain('read-only')
    expect(CODE_WORKSPACE_FOLDER_NOTE).toContain('a task given this workspace, or a conversation started in the workspace')
  })
})
