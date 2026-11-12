/**
 * A save reads the open views again only once it has landed: a failed one re-reads nothing, so a save while HQ cannot
 * be reached never re-reads the signed-in person and replaces the app (design review, C1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ops = vi.hoisted(() => ({ savePictures: vi.fn(), invalidateQueries: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  savePictures: ops.savePictures,
  queryClientInitialized: Promise.resolve({ invalidateQueries: ops.invalidateQueries }),
}))

import { saveAndRefresh } from '../useSavePictures'

const args = { subject: { kind: 'agent' as const, id: 'a1' }, avatar: { remove: true as const } }

beforeEach(() => { ops.savePictures.mockReset(); ops.invalidateQueries.mockReset() })

describe('saveAndRefresh', () => {
  it('reads the views again after a save that lands', async () => {
    ops.savePictures.mockResolvedValue({ avatarUrl: null, avatarRecipe: null, coverUrl: null, coverRecipe: null })
    await saveAndRefresh(args)
    await Promise.resolve()
    expect(ops.invalidateQueries).toHaveBeenCalledTimes(1)
    const { predicate } = ops.invalidateQueries.mock.calls[0][0]
    expect(predicate({ queryKey: ['auth/me'] })).toBe(false)
    expect(predicate({ queryKey: ['operations/get-org-agents'] })).toBe(true)
  })

  it("reads the signed-in person again after a person's picture is saved", async () => {
    ops.savePictures.mockResolvedValue({ avatarUrl: null, avatarRecipe: null, coverUrl: null, coverRecipe: null })
    await saveAndRefresh({ subject: { kind: 'person', id: 'u1' }, avatar: { remove: true } })
    await Promise.resolve()
    expect(ops.invalidateQueries.mock.calls[0][0].predicate({ queryKey: ['auth/me'] })).toBe(true)
  })

  it('reads nothing again when the save fails', async () => {
    ops.savePictures.mockRejectedValue(new Error('Failed to fetch'))
    await expect(saveAndRefresh(args)).rejects.toThrow('Failed to fetch')
    await Promise.resolve()
    expect(ops.invalidateQueries).not.toHaveBeenCalled()
  })
})
