import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../random'
import { blobs } from '../patternsScatter'

describe('the blobs pattern @SC-2009', () => {
  it('blurs inside a region wider than its shapes, so no straight edge shows', () => {
    expect(blobs(seededRng(1), 'aabbcc', 'ddeeff')).toContain('<filter id="blur" x="-20%" y="-20%" width="140%" height="140%">')
  })
})
