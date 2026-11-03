import { expect, it } from 'vitest'
import { withFeatureAt } from '../../withFeature.js'

withFeatureAt('trial', 'experimental', () => {
  it('breaks', () => {
    expect('what it does').toBe('what it should do')
  })
  it('works', () => {
    expect(1).toBe(1)
  })
})
