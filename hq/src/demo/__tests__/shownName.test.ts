import { describe, expect, it } from 'vitest'
import { shownHandle, shownName } from '../useShownName'
import { visitorNumber } from '../visitors'

describe('the name a screen greets the signed-in person by @SC-1973', () => {
  it("is a demo visitor's display name, not their made-up username", () => {
    expect(shownName('visitor-af085f4b93a20d807d5e3ca6', 'Visitor 4234', true)).toBe('Visitor 4234')
  })

  it("is everyone else's username, in the demo and out of it", () => {
    expect(shownName('sam', 'Sam Okafor', true)).toBe('sam')
    expect(shownName('visitor-af085f4b93a20d807d5e3ca6', 'Visitor 4234', false)).toBe('visitor-af085f4b93a20d807d5e3ca6')
    expect(shownName('visitor-af085f4b93a20d807d5e3ca6', null, true)).toBe('visitor-af085f4b93a20d807d5e3ca6')
    expect(shownName(null, 'Visitor 4234', true)).toBeNull()
  })
})

describe("the handle a screen shows (walkthrough finding 10) @SC-1973", () => {
  const username = 'visitor-7801991832c994461474e94a'

  it("is a demo visitor's number, the one in their name, never their made-up username", () => {
    const n = visitorNumber(username)!
    expect(n).toBeGreaterThanOrEqual(1000)
    expect(n).toBeLessThan(10000)
    expect(shownHandle(username, true)).toBe(`visitor-${n}`)
    expect(shownHandle(username, true)).toBe(shownHandle(username, true))
  })

  it("is everyone else's username, and everyone's outside the demo", () => {
    expect(shownHandle('sam', true)).toBe('sam')
    expect(shownHandle(username, false)).toBe(username)
    expect(shownHandle(null, true)).toBeNull()
    expect(visitorNumber('sam')).toBeNull()
  })
})
