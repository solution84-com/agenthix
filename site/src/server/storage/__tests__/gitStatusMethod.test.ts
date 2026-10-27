/**
 * `git.status` as the channel serves it: the folder confined as any location is, a folder not made yet answered as
 * no repository, and refusals in the repository-work vocabulary that name no path on this disk.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RepoWorkError } from '@agenthix/core'
import { gitStatus } from '../gitStatusMethod'
import { locationDir, ownerDir } from '../paths'

const exec = promisify(execFile)
const mine = { ownerType: 'project' as const, ownerId: 'proj-mine' }
const theirs = { ownerType: 'project' as const, ownerId: 'proj-theirs' }
const workspace = { ...mine, workspaceId: 'ws-1', taskId: null }

let root: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  await fs.mkdir(ownerDir(mine.ownerType, mine.ownerId), { recursive: true })
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

async function refusal(params: unknown) {
  const err = await gitStatus(params).then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(RepoWorkError)
  expect((err as Error).message).not.toContain(root)
  return (err as RepoWorkError).code
}

describe('git.status on the channel @SC-1508', () => {
  it('reads a workspace that is a repository', async () => {
    const dir = locationDir(workspace)
    await fs.mkdir(dir, { recursive: true })
    await exec('git', ['-C', dir, 'init', '-q', '-b', 'main'])
    await fs.writeFile(path.join(dir, 'a.md'), 'a')
    const answer = await gitStatus({ loc: workspace })
    expect(answer).toMatchObject({ repository: true, head: { kind: 'branch', name: 'main' }, changed: 1, lastCommit: null })
    expect(JSON.stringify(answer)).not.toContain(root)
  })

  it('answers a folder not made yet, or a plain one, as no repository', async () => {
    expect(await gitStatus({ loc: workspace })).toEqual({ repository: false })
    await fs.mkdir(locationDir(mine), { recursive: true })
    expect(await gitStatus({ loc: { ...mine, workspaceId: null, taskId: null } })).toEqual({ repository: false })
  })

  it('refuses a workspace replaced by a link to another owner\'s repository', async () => {
    const other = locationDir({ ...theirs, workspaceId: 'ws-9' })
    await fs.mkdir(other, { recursive: true })
    await exec('git', ['-C', other, 'init', '-q'])
    await fs.mkdir(path.join(ownerDir(mine.ownerType, mine.ownerId), 'workspaces'), { recursive: true })
    await fs.symlink(other, locationDir(workspace))
    expect(await refusal({ loc: workspace })).toBe('outside')
  })

  it('refuses params of the wrong shape, and an id that would step out', async () => {
    expect(await refusal({ loc: { ownerType: 'nobody', ownerId: 'x' } })).toBe('invalid')
    expect(await refusal({ loc: { ...mine, workspaceId: '../../proj-theirs' } })).toBe('outside')
  })
})
