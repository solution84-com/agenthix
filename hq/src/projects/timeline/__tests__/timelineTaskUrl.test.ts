import { describe, it, expect } from 'vitest'
import { openOf } from '../useTimelineTaskUrl'

describe('the task open in the timeline, in the address @SC-570', () => {
  it('is none without a task', () => {
    expect(openOf(new URLSearchParams('tool=timeline'))).toBeNull()
    expect(openOf(new URLSearchParams('tview=session'))).toBeNull()
  })

  it('is the task, and its session where asked', () => {
    expect(openOf(new URLSearchParams('tool=timeline&ttask=WEB-27'))).toEqual({ taskKey: 'WEB-27', session: false })
    expect(openOf(new URLSearchParams('ttask=WEB-27&tview=session'))).toEqual({ taskKey: 'WEB-27', session: true })
  })

  it('does not read the Tasks or Boards tools\' names', () => {
    expect(openOf(new URLSearchParams('task=WEB-1&btask=WEB-2&view=session'))).toBeNull()
  })
})
