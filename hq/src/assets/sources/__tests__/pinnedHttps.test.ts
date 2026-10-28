import { describe, expect, it } from 'vitest'
import type { LookupAddress } from 'node:dns'
import { pinnedLookup } from '../pinnedHttps'

describe('pinnedLookup', () => {
  const lookup = pinnedLookup({ address: '140.82.112.3', family: 4 })

  it('answers a single lookup with the pinned address, whatever name is asked', () => {
    let answer: unknown[] = []
    lookup('rebinding.example.com', {}, (...args) => { answer = args })
    expect(answer).toEqual([null, '140.82.112.3', 4])
  })

  it('answers a lookup for every address with only the pinned one', () => {
    let addresses: string | LookupAddress[] = ''
    lookup('rebinding.example.com', { all: true }, (_error, found) => { addresses = found })
    expect(addresses).toEqual([{ address: '140.82.112.3', family: 4 }])
  })
})
