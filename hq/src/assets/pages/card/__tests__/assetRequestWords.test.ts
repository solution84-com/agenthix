import { describe, expect, it } from 'vitest'
import { changeEffect, changeHeading, staleOf } from '../assetRequestWords'
import type { AssetRequestChange } from '../assetRequestChange'

type Shown = Exclude<AssetRequestChange, { kind: 'none' }>
const publish: Shown = { kind: 'publish', identity: 'fernhill/code-review', requestedBy: 'Ada', from: '1.1.0', to: '1.2.0', note: 'Adds rate limits', stale: null, changes: [] }

describe("an agent's request on its approval card (D31)", () => {
  it('says who asks, what, and which version', () => {
    expect(changeHeading(publish)).toBe('Ada asks you to publish fernhill/code-review 1.2.0, now 1.1.0')
    expect(changeHeading({ kind: 'rollBack', identity: 'fernhill/code-review', requestedBy: null, from: '1.2.0', to: '1.1.0', reason: 'x', changes: [], stale: null }))
      .toBe('An agent asks you to roll fernhill/code-review back from 1.2.0 to 1.1.0')
    expect(changeHeading({ kind: 'switchOn', requestedBy: 'Ada', skill: 'deploy-preview', place: 'Website rebuild', stale: null }))
      .toBe('Ada asks you to switch on deploy-preview in Website rebuild')
  })

  it('says who is recorded as having done it, and that an unsigned install is not done from a card', () => {
    expect(changeEffect(publish)).toContain('You are recorded as having done it')
    expect(changeEffect({ kind: 'install', requestedBy: 'Ada', source: 'https://x', note: null })).toContain("add it from the Library, where you can read it first")
  })

  it('carries a request that has gone stale', () => {
    expect(staleOf({ ...publish, stale: 'The draft has changed.' })).toBe('The draft has changed.')
    expect(staleOf({ kind: 'install', requestedBy: null, source: 'x', note: null })).toBeNull()
  })
})
