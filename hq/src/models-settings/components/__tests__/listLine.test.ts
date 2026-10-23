import { describe, expect, it } from 'vitest'
import { listLine } from '../ListSummary'
import type { ListView } from '../../types'

const view = (over: Partial<ListView>): ListView =>
  ({ owner: 'organisation', ownerId: 'o', mode: 'every', entries: [], reachable: 52, allowedAbove: 52, allowed: 52, ...over })
const never = (pattern: string) => ({ effect: 'never' as const, pattern, covers: 1, kind: 'model' as const, meaning: '' })

describe('the list in one line @SC-1202', () => {
  it('says any model, and what it never allows', () => {
    expect(listLine(view({}))).toBe('Any model your providers reach · 52 models')
    expect(listLine(view({ entries: [never('*-pro')], allowed: 48 }))).toBe('Any model your providers reach · 48 models · Never: *-pro')
  })

  it('names the list above for an agent’s, and how many more are banned', () => {
    expect(listLine(view({ entries: [never('a'), never('b'), never('c')], allowed: 1 }), 'Fernhill'))
      .toBe('Any model Fernhill allows · 1 model · Never: a, b and 1 more')
  })

  it('says Only these with what they are', () => {
    const only = view({ mode: 'only_these', allowed: 4, entries: [{ effect: 'allow', pattern: 'anthropic/*', covers: 4, kind: 'maker', meaning: '' }] })
    expect(listLine(only)).toBe('Only anthropic/* · 4 models')
    expect(listLine(view({ mode: 'only_these', allowed: 0 }))).toBe('Only nothing yet · 0 models')
  })
})
