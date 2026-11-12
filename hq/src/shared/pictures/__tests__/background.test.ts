import { describe, expect, it } from 'vitest'
import { dicebearBackground } from '../styles/background'

describe('dicebearBackground @SC-2006', () => {
  it('runs a two-colour background from top-left to bottom-right (DiceBear rotation 45)', () => {
    const o = dicebearBackground({ background: 'indigo', background2: 'pink' })
    expect(o.backgroundType).toEqual(['gradientLinear'])
    expect(o.backgroundRotation).toEqual([45])
  })

  it('keeps one colour solid', () => {
    expect(dicebearBackground({ background: 'indigo', background2: null }).backgroundType).toEqual(['solid'])
  })
})
