import { describe, it, expect } from 'vitest'
import { automationScreenOf } from '../useAutomationToolUrl'
import { routineHref } from '../../../projects/routines/routineAddresses'

describe("the Automation tool's address @SC-684", () => {
  it('opens Rules by name, and the overview otherwise', () => {
    expect(automationScreenOf(new URLSearchParams('aview=rules'))).toEqual({ view: 'rules' })
    expect(automationScreenOf(new URLSearchParams('tool=automation'))).toEqual({ view: 'overview' })
    expect(automationScreenOf(new URLSearchParams('tool=automation&aview=routines'))).toEqual({ view: 'overview' })
  })

  it("a routine's address is in its place's Routines: its project's, or the person's own space's", () => {
    expect(routineHref({ key: 'WEB' }, 'r1')).toBe('/projects/WEB?tool=routines&routine=r1')
    expect(routineHref({ key: null }, 'r2')).toBe('/chat?tool=routines&routine=r2')
  })
})
