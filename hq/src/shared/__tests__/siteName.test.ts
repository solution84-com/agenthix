import { describe, it, expect } from 'vitest'
import { displayRelayName, displaySiteName, siteAsShown } from '../siteName'

describe("a site's name as shown @SC-637 @SC-732", () => {
  it("names HQ's own site after its machine, tagged as HQ's", () => {
    expect(displaySiteName({ label: 'hq-box', isDefault: true })).toBe("hq-box · HQ's site")
  })

  it('leaves every other site its own name', () => {
    expect(displaySiteName({ label: 'Design laptop', isDefault: false })).toBe('Design laptop')
  })

  it('hands a site row to the client with its label as shown, and no more', () => {
    expect(siteAsShown({ id: 'e1', label: 'hq-box', isDefault: true })).toEqual({ id: 'e1', label: "hq-box · HQ's site" })
    expect(siteAsShown(null)).toBeNull()
  })
})

describe("a relay's name as shown @SC-1529", () => {
  it("names hq's relay after its machine, tagged as its site is, so it is not read as the machine", () => {
    expect(displayRelayName({ name: 'hq-box', isHq: true })).toBe("hq-box · HQ's relay")
  })

  it('leaves every other relay its own name', () => {
    expect(displayRelayName({ name: 'edge-1', isHq: false })).toBe('edge-1')
  })
})
