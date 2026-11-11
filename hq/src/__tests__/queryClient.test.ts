import { describe, expect, it } from 'vitest'
import { readsOnItsOwn } from '../queryClient'

describe('reads made on their own @SC-1938', () => {
  it('never reads the signed-in person again on its own, so a failed read cannot replace the app while HQ is away', () => {
    expect(readsOnItsOwn({ queryKey: ['auth/me'] })).toBe(false)
  })

  it('lets every other read refresh on a page opening, the focus and a reconnect', () => {
    expect(readsOnItsOwn({ queryKey: ['operations/get-agents'] })).toBe(true)
  })
})
