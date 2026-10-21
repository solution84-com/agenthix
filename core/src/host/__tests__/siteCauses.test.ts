import { describe, expect, it } from 'vitest'
import { parseSiteCause, SITE_CAUSES } from '../siteCauses.js'

describe('parseSiteCause', () => {
  it('keeps each known cause', () => {
    for (const cause of SITE_CAUSES) expect(parseSiteCause(cause)).toBe(cause)
  })

  it('drops anything else', () => {
    for (const raw of ['none', 'Unreachable', '', null, undefined, 3, {}]) expect(parseSiteCause(raw)).toBeNull()
  })
})
