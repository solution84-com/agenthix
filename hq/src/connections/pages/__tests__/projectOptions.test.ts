import { describe, expect, it } from 'vitest'
import { connectionProjectOptions } from '../projectOptions'

describe('the projects a new connection can be limited to', () => {
  it('offers only the projects the person is a member of', () => {
    expect(connectionProjectOptions([
      { id: 'a', name: 'Mine', isMember: true },
      { id: 'b', name: 'Open, not joined', isMember: false },
    ])).toEqual([{ id: 'a', name: 'Mine' }])
  })

  it('offers none before the projects load', () => {
    expect(connectionProjectOptions(undefined)).toEqual([])
  })
})
