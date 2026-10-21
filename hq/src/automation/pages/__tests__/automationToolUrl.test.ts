import { describe, it, expect } from 'vitest'
import { automationScreenOf } from '../useAutomationToolUrl'
import { routineAddress } from '../routineAddress'

describe("the Automation tool's address @SC-684", () => {
  it('opens a routine at its own address, and each view by name', () => {
    expect(automationScreenOf(new URLSearchParams('tool=automation&routine=r1'))).toEqual({ view: 'routine', routineId: 'r1' })
    expect(automationScreenOf(new URLSearchParams('tool=automation&aview=routines'))).toEqual({ view: 'routines' })
    expect(automationScreenOf(new URLSearchParams('aview=new-routine'))).toEqual({ view: 'newRoutine' })
    expect(automationScreenOf(new URLSearchParams('aview=rules'))).toEqual({ view: 'rules' })
    expect(automationScreenOf(new URLSearchParams('tool=automation'))).toEqual({ view: 'overview' })
  })

  it("a routine's address is in its project, or in the person's Chat", () => {
    expect(routineAddress({ key: 'WEB' }, 'r1')).toBe('/projects/WEB?tool=automation&routine=r1')
    expect(routineAddress({ key: null }, 'r2')).toBe('/chat?tool=automation&routine=r2')
  })
})
