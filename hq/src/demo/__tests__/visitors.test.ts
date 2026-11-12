import { afterEach, describe, expect, it } from 'vitest'
import { hideOtherVisitors, isVisitorUsername, VISITOR_USER } from '../visitors'
import { setDemoModeForTests } from '../demoMode'

afterEach(() => setDemoModeForTests(null))

describe('visitors in the lists of people @SC-1972', () => {
  it('knows a visitor by the username Enter the demo gives', () => {
    expect(isVisitorUsername('visitor-0a1b')).toBe(true)
    expect(isVisitorUsername('sam')).toBe(false)
    expect(isVisitorUsername(null)).toBe(false)
  })

  it('in demo mode, keeps every visitor out but the one looking', () => {
    setDemoModeForTests(true)
    expect(hideOtherVisitors('me')).toEqual({ OR: [{ id: 'me' }, { NOT: VISITOR_USER }] })
    expect(hideOtherVisitors(undefined)).toEqual({ NOT: VISITOR_USER })
  })

  it('with the setting off, changes nothing', () => {
    setDemoModeForTests(false)
    expect(hideOtherVisitors('me')).toEqual({})
  })
})
