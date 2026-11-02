/**
 * A code workspace connected to GitHub (live preview spec, *Merge into main*, GitHub): versions on GitHub arrive in
 * `main` before a merge or a restore, and `main` is pushed after one, each with a token minted for that one call and
 * ended at once. A workspace not connected asks nothing of GitHub.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getAttachment: vi.fn(), mintForLocation: vi.fn(), revokeGateToken: vi.fn(), siteCall: vi.fn(), emitMainChange: vi.fn(),
}))
vi.mock('../../storage/repoAttachmentService', () => ({ getAttachment: m.getAttachment }))
vi.mock('../../github/mintGate', () => ({ mintForLocation: m.mintForLocation, revokeGateToken: m.revokeGateToken }))
vi.mock('../siteCalls', () => ({ siteCall: m.siteCall }))
vi.mock('../workspaceEvents', () => ({ emitMainChange: m.emitMainChange }))

import { pullMainFirst, pushMainAfter } from '../githubMain'

const ref = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const TOKEN = 'ghs_minted_for_one_call'
const HEAD = 'c'.repeat(40)

beforeEach(() => {
  vi.clearAllMocks()
  m.getAttachment.mockResolvedValue({ repo: 'shop/app' })
  m.mintForLocation.mockResolvedValue({ token: TOKEN })
  m.revokeGateToken.mockResolvedValue(true)
})

describe('before a merge or a restore @SC-1682', () => {
  it('takes in the versions GitHub has, with a read token minted for the workspace and ended after', async () => {
    m.siteCall.mockResolvedValue({ pulled: true, head: HEAD, versions: [{ number: 7 }, { number: 8 }] })
    await pullMainFirst('site-1', ref, 'u1')
    expect(m.mintForLocation).toHaveBeenCalledWith({
      place: { type: 'project', id: 'p1' }, siteId: 'site-1', workspaceId: 'w1', person: 'u1', needs: 'work',
      permissions: { contents: 'read' },
    })
    expect(m.siteCall).toHaveBeenCalledWith('site-1', 'git.pullMain', { workspace: ref, token: TOKEN })
    expect(m.revokeGateToken).toHaveBeenCalledWith(TOKEN)
    expect(m.emitMainChange).toHaveBeenCalledWith('w1', 'pulled', 8)
  })

  it('says nothing changed when main was up to date or has gone its own way', async () => {
    m.siteCall.mockResolvedValueOnce({ pulled: true, head: HEAD, versions: [] })
    await pullMainFirst('site-1', ref, 'u1')
    m.siteCall.mockResolvedValueOnce({ pulled: false, reason: 'diverged' })
    await pullMainFirst('site-1', ref, 'u1')
    expect(m.emitMainChange).not.toHaveBeenCalled()
    expect(m.revokeGateToken).toHaveBeenCalledTimes(2)
  })

  it('goes on with the merge when GitHub is out of reach, and still ends the token', async () => {
    m.siteCall.mockRejectedValue(new Error('github.com unreachable'))
    await expect(pullMainFirst('site-1', ref, 'u1')).resolves.toBeUndefined()
    expect(m.revokeGateToken).toHaveBeenCalledWith(TOKEN)
  })

  it('mints nothing and asks the site nothing for a workspace not connected to GitHub', async () => {
    m.getAttachment.mockResolvedValue(null)
    await pullMainFirst('site-1', ref, 'u1')
    expect(m.mintForLocation).not.toHaveBeenCalled()
    expect(m.siteCall).not.toHaveBeenCalled()
  })
})

describe('after a merge or a restore @SC-1682', () => {
  it('pushes main with a write token minted for the workspace, ended after', async () => {
    m.siteCall.mockResolvedValue({ pushed: true, head: HEAD })
    expect(await pushMainAfter('site-1', ref, 'u1')).toBe('pushed')
    expect(m.mintForLocation).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', person: 'u1', permissions: { contents: 'write' } }))
    expect(m.siteCall).toHaveBeenCalledWith('site-1', 'git.pushMain', { workspace: ref, token: TOKEN })
    expect(m.revokeGateToken).toHaveBeenCalledWith(TOKEN)
  })

  it('says so when GitHub has versions main lacks, and when the push failed, never echoing the token', async () => {
    m.siteCall.mockResolvedValueOnce({ pushed: false, reason: 'remote_ahead' })
    expect(await pushMainAfter('site-1', ref, 'u1')).toBe('remote_ahead')
    m.siteCall.mockRejectedValueOnce(new Error('denied'))
    const outcome = await pushMainAfter('site-1', ref, 'u1')
    expect(outcome).toBe('not_pushed')
    expect(JSON.stringify(outcome)).not.toContain(TOKEN)
    expect(m.revokeGateToken).toHaveBeenCalledTimes(2)
  })

  it('answers null, minting nothing, for a workspace not connected to GitHub', async () => {
    m.getAttachment.mockResolvedValue(null)
    expect(await pushMainAfter('site-1', ref, 'u1')).toBeNull()
    expect(m.mintForLocation).not.toHaveBeenCalled()
  })
})
