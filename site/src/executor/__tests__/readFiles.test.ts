import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { WORKFLOW_LIMITS } from '@agenthix/core'

const findUnique = vi.fn()
vi.mock('#db', () => ({ prisma: { workspace: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))

import { readWorkflowFiles } from '../readFiles'
import { tempDir, writeTree } from './fixtures'

const workspace = { ownerType: 'project' as const, ownerId: 'proj-1', workspaceId: 'ws-1' }
let siteRoot: string
let ws: string
let outside: string
const savedRoot = process.env.SITE_ROOT

beforeEach(async () => {
  siteRoot = await tempDir('executor-read-')
  process.env.SITE_ROOT = siteRoot
  ws = path.join(siteRoot, 'projects/proj-1/workspaces/ws-1')
  outside = path.join(siteRoot, 'outside')
  await writeTree(ws, { 'wf/workflow.yaml': 'name: x\n', 'wf/deploy.sh': '#!/bin/sh\n' })
  await fs.chmod(path.join(ws, 'wf/deploy.sh'), 0o755)
  await writeTree(outside, { 'key.pem': 'not for the agent' })
  findUnique.mockResolvedValue({ id: 'ws-1', ownerType: 'project', ownerId: 'proj-1' })
})

afterEach(async () => {
  process.env.SITE_ROOT = savedRoot
  await fs.rm(siteRoot, { recursive: true, force: true })
})

describe('workflow.readFiles', () => {
  it('reads each file with its executable bit', async () => {
    const r = await readWorkflowFiles({ workspace, paths: ['wf/workflow.yaml', 'wf/deploy.sh'] })
    expect(r).toEqual({
      ok: true,
      files: [
        { path: 'wf/workflow.yaml', contentBase64: Buffer.from('name: x\n').toString('base64'), executable: false },
        { path: 'wf/deploy.sh', contentBase64: Buffer.from('#!/bin/sh\n').toString('base64'), executable: true },
      ],
    })
  })

  it('refuses a symbolic link at the file, never reading what it points at', async () => {
    await fs.symlink(path.join(outside, 'key.pem'), path.join(ws, 'wf/key.pem'))
    const r = await readWorkflowFiles({ workspace, paths: ['wf/key.pem'] })
    expect(r).toMatchObject({ ok: false, reason: 'link', path: 'wf/key.pem' })
    expect(JSON.stringify(r)).not.toContain('not for the agent')
  })

  it('refuses a symbolic link among the folders', async () => {
    await fs.symlink(outside, path.join(ws, 'linked'))
    expect(await readWorkflowFiles({ workspace, paths: ['linked/key.pem'] })).toMatchObject({ ok: false, reason: 'link' })
  })

  it('refuses a hard link', async () => {
    await fs.link(path.join(outside, 'key.pem'), path.join(ws, 'wf/hard.pem'))
    expect(await readWorkflowFiles({ workspace, paths: ['wf/hard.pem'] })).toMatchObject({ ok: false, reason: 'link' })
  })

  it('refuses a missing file, a folder and a file too large', async () => {
    expect(await readWorkflowFiles({ workspace, paths: ['wf/none.sh'] })).toMatchObject({ ok: false, reason: 'missing' })
    expect(await readWorkflowFiles({ workspace, paths: ['wf'] })).toMatchObject({ ok: false, reason: 'not_a_file' })
    await fs.writeFile(path.join(ws, 'wf/big.bin'), Buffer.alloc(WORKFLOW_LIMITS.fileBytesMax + 1))
    expect(await readWorkflowFiles({ workspace, paths: ['wf/big.bin'] })).toMatchObject({ ok: false, reason: 'too_large' })
  })

  it('refuses paths that are not normalised or climb out', async () => {
    for (const p of ['../outside/key.pem', '/etc/passwd', './wf/deploy.sh', 'wf//deploy.sh']) {
      expect(await readWorkflowFiles({ workspace, paths: [p] })).toMatchObject({ ok: false, reason: 'invalid_path' })
    }
  })

  it('refuses a workspace this site does not hold', async () => {
    findUnique.mockResolvedValue(null)
    expect(await readWorkflowFiles({ workspace, paths: ['wf/deploy.sh'] })).toMatchObject({ ok: false, reason: 'workspace_missing' })
    findUnique.mockResolvedValue({ id: 'ws-1', ownerType: 'project', ownerId: 'another' })
    expect(await readWorkflowFiles({ workspace, paths: ['wf/deploy.sh'] })).toMatchObject({ ok: false, reason: 'workspace_missing' })
  })
})
