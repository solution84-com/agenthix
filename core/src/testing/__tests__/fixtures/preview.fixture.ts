import { expect, it } from 'vitest'
import { withFeatureAt } from '../../withFeature.js'

withFeatureAt('trial', 'preview', () => {
  it('breaks', () => {
    expect('what it does').toBe('what it should do')
  })
})
