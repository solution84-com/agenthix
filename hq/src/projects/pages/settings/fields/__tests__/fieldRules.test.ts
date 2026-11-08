/** Settings › Custom fields' rules (spec D4): names, limits, the order, and what a delete says it takes. */
import { describe, expect, it } from 'vitest'
import { FIELD_OPTIONS_MAX, PROJECT_CUSTOM_FIELDS_MAX } from '@agenthix/core'
import {
  VIEWER_CANNOT_CHANGE_FIELDS, deleteFieldWords, droppedBefore, movedOne, nameProblem, newFieldWhy, newOptionWhy, optionLines,
  optionLinesProblem,
} from '../fieldRules'

describe('names', () => {
  it('refuses an empty, too long or repeated name, ignoring case', () => {
    expect(nameProblem('  ', 40, [], 'field')).toBe('Give the field a name')
    expect(nameProblem('x'.repeat(41), 40, [], 'option')).toBe("An option's name is at most 40 characters")
    expect(nameProblem('channel', 40, ['Channel'], 'field')).toBe('This project already has a field named "channel"')
    expect(nameProblem('Review', 40, ['Design'], 'option')).toBeNull()
  })

  it('reads a new field\'s options one per line, and refuses two of one name', () => {
    expect(optionLines(' Copy \n\nDesign\n')).toEqual(['Copy', 'Design'])
    expect(optionLinesProblem(['Copy', 'copy'])).toBe('Two options are named "copy"')
    expect(optionLinesProblem(Array.from({ length: FIELD_OPTIONS_MAX + 1 }, (_, i) => `o${i}`))).toBe(`A field has at most ${FIELD_OPTIONS_MAX} options`)
  })
})

describe('what is greyed', () => {
  it('greys every change for a Viewer, and New field at the most fields', () => {
    expect(newFieldWhy(0, false)).toBe(VIEWER_CANNOT_CHANGE_FIELDS)
    expect(newFieldWhy(PROJECT_CUSTOM_FIELDS_MAX, true)).toMatch(/at most/)
    expect(newFieldWhy(1, true)).toBeNull()
  })

  it('greys Add option on an archived field, saying to bring it back', () => {
    expect(newOptionWhy({ options: [], archivedAt: new Date() }, true)).toBe('It is archived: bring it back first')
    expect(newOptionWhy({ options: [], archivedAt: null }, true)).toBeNull()
  })
})

describe('the order', () => {
  it('moves one place, not past the ends', () => {
    expect(movedOne(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(movedOne(['a', 'b', 'c'], 'c', 1)).toBeNull()
  })

  it('drops before a target, or last; a drop that moves nothing is no change', () => {
    expect(droppedBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(droppedBefore(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a'])
    expect(droppedBefore(['a', 'b', 'c'], 'a', 'b')).toBeNull()
  })
})

describe('deleting a field', () => {
  it('says how many tasks lose a value and which boards go, and that archiving keeps them', () => {
    expect(deleteFieldWords('Channel', { taskCount: 3, boardCount: 1 })).toBe(
      "3 tasks lose their values and 1 board of it goes. No task moves and no task's state changes. To keep the values, archive it instead.",
    )
    expect(deleteFieldWords('Channel', { taskCount: 0, boardCount: 0 })).toMatch(/^No task has a value in it\./)
  })
})
