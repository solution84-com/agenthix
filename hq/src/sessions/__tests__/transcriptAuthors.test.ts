import { describe, it, expect, vi, beforeEach } from 'vitest'

const usernames = vi.hoisted(() => vi.fn())
vi.mock('../../projects/onBehalfOfOperations', () => ({ usernames }))

import { withAuthorNames, UNKNOWN_AUTHOR } from '../transcriptAuthors'

beforeEach(() => {
  usernames.mockReset()
  usernames.mockResolvedValue(new Map([['u-ana', 'ana']]))
})

// Names on messages (every-screen-reviewed spec §9): another person's message is named; the viewer's own, and a
// row with no sender, are not, and read as "You".
describe('withAuthorNames @SC-519', () => {
  it("names other people's messages and leaves the viewer's own and unsigned rows unnamed", async () => {
    const entries = [
      { id: '1', authorId: 'u-ana' },
      { id: '2', authorId: 'u-me' },
      { id: '3', authorId: null },
      { id: '4' },
      { id: '5', authorId: 'u-gone' },
    ]
    const named = await withAuthorNames(entries, 'u-me')
    expect(named.map(e => e.authorName)).toEqual(['ana', null, null, null, UNKNOWN_AUTHOR])
    expect(usernames).toHaveBeenCalledWith(['u-ana', 'u-gone'])
  })

  it('looks nobody up when every message is the viewer\'s', async () => {
    await withAuthorNames([{ authorId: 'u-me' }, { authorId: null }], 'u-me')
    expect(usernames).not.toHaveBeenCalled()
  })
})
