/**
 * Finding 9: a page asking before its route resolved sent no id, and the
 * queries crashed in the database with a 500. A read that names no id is a
 * malformed request and is refused as one — before any lookup, so no database
 * is needed to show it.
 */
import { describe, it, expect } from 'vitest'
import { requireProjectVisible, requireTaskVisible, requireBoardVisible } from '../resourceEntitlement'

describe('a read with no id is refused with a 400, never reaching the database', () => {
  it.each([
    ['project', () => requireProjectVisible(undefined as unknown as string, 'u1')],
    ['task', () => requireTaskVisible(undefined as unknown as string, 'u1')],
    ['board', () => requireBoardVisible('' as string, 'u1')],
  ])('%s', async (what, call) => {
    await expect(call()).rejects.toMatchObject({ statusCode: 400, message: `A ${what} id is required` })
  })
})
