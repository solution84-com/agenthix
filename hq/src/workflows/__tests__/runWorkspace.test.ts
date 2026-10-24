import { describe, it, expect, vi } from 'vitest'

vi.mock('../../storage/storageSite', () => ({ resolveStorageSite: vi.fn() }))
vi.mock('../../storage/workspaceStore', () => ({ listWorkspacesByOwner: vi.fn() }))

import { chooseRunWorkspace } from '../runWorkspace'

const run = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null }
const of = (...names: string[]) => ({ workspacesOf: async () => names.map((name, i) => ({ id: `w${i + 1}`, name })) })

describe('the workspace a workflow run acts on @SC-1302', () => {
  it('a named workspace of the place, by name or id', async () => {
    expect(await chooseRunWorkspace(run, 'Demo', of('demo', 'site'))).toEqual({ ...run, workspaceId: 'w1' })
    expect(await chooseRunWorkspace(run, 'w2', of('demo', 'site'))).toEqual({ ...run, workspaceId: 'w2' })
  })

  it('never a workspace the place does not have', async () => {
    await expect(chooseRunWorkspace(run, 'other', of('demo', 'site'))).rejects.toThrow(/no workspace "other". Its workspaces are "demo", "site"/)
    await expect(chooseRunWorkspace({ ...run, workspaceId: 'w1' }, 'elsewhere', of('demo'))).rejects.toThrow(/no workspace "elsewhere"/)
  })

  it('unnamed: the run\'s own, else the only one, else the place\'s files; several must be named', async () => {
    expect(await chooseRunWorkspace({ ...run, workspaceId: 'w9' }, undefined, of('demo', 'site'))).toEqual({ ...run, workspaceId: 'w9' })
    expect(await chooseRunWorkspace(run, undefined, of('demo'))).toEqual({ ...run, workspaceId: 'w1' })
    expect(await chooseRunWorkspace(run, '  ', of())).toEqual(run)
    await expect(chooseRunWorkspace(run, undefined, of('demo', 'site'))).rejects.toThrow(/Name the workspace/)
  })

  it('asks for the id when two share a name', async () => {
    await expect(chooseRunWorkspace(run, 'demo', of('demo', 'Demo'))).rejects.toThrow(/pass its id/)
  })
})
