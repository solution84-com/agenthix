import { describe, expect, it } from 'vitest'
import { platformFacts, type PlatformFactsStore } from '../platformFacts'

function memoryStore(active: string[]): PlatformFactsStore & { asks: string[] } {
  const asks = ['u1', 'u2', 'gone']
  const dismissals = new Map<string, Set<string>>()
  return {
    asks,
    askerIds: async () => asks,
    countActive: async ids => ids.filter(id => active.includes(id)).length,
    dismissedBy: async userId => [...(dismissals.get(userId) ?? [])],
    async dismiss(userId, offer) {
      dismissals.set(userId, (dismissals.get(userId) ?? new Set()).add(offer))
    },
  }
}

describe('what the platform shows fleet admins of Agenthix Cloud @SC-1112', () => {
  it('counts the people who asked, not those who have since left', async () => {
    expect(await platformFacts(memoryStore(['u1', 'u2'])).askCount()).toBe(2)
  })

  it('counts nothing when nobody asked', async () => {
    const store = memoryStore([])
    store.asks.length = 0
    expect(await platformFacts(store).askCount()).toBe(0)
  })

  it('keeps a dismissal per person and per offer, for good', async () => {
    const facts = platformFacts(memoryStore([]))
    expect(await facts.dismissed('u1')).toEqual([])
    expect(await facts.dismiss('u1', 'site')).toEqual(['site'])
    expect(await facts.dismiss('u1', 'site')).toEqual(['site'])
    expect(await facts.dismiss('u1', 'address')).toEqual(['site', 'address'])
    expect(await facts.dismissed('u2')).toEqual([])
  })

  it('ignores a stored offer it does not know', async () => {
    const store = memoryStore([])
    await store.dismiss('u1', 'something-old' as never)
    expect(await platformFacts(store).dismissed('u1')).toEqual([])
  })
})
