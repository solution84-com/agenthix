import { describe, it, expect } from 'vitest'
import { bulkOutcome } from '../taskSelectionWords'

describe('what an action on ticked tasks says when some did not change', () => {
  it('says nothing when every task changed: the list shows it', () => {
    expect(bulkOutcome('archived', [], 3, null)).toBeNull()
  })

  it('names the ones that did not change, and why, and says they stay ticked', () => {
    expect(bulkOutcome('archived', ['WEB-4'], 3, 'Cannot archive a task that is currently running. Stop it first. Nothing was changed.'))
      .toBe('2 of 3 tasks were archived; WEB-4 was not. Cannot archive a task that is currently running. Stop it first. They are still ticked.')
  })

  it('says nothing was changed when none did, and shortens a long list of keys', () => {
    expect(bulkOutcome('moved to To do', ['WEB-1', 'WEB-2', 'WEB-3', 'WEB-4', 'WEB-5'], 5, null))
      .toBe('None of the 5 tasks were moved to To do. Nothing was changed.')
    expect(bulkOutcome('moved to To do', ['WEB-1'], 1, null)).toBe('WEB-1 was not moved to To do. Nothing was changed.')
    expect(bulkOutcome('assigned', ['A-1', 'A-2', 'A-3', 'A-4'], 6, null)).toBe('2 of 6 tasks were assigned; A-1, A-2, A-3 and 1 more were not. They are still ticked.')
  })
})
