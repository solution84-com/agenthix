import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBarDrag } from '../useBarDrag'
import type { TimelineView } from '../layout'

const DAY = 24 * 60 * 60 * 1000
const view = { scale: 'month', from: 0, to: 10 * DAY, columns: [], groups: [] } as unknown as TimelineView

function setup() {
  const onCommit = vi.fn()
  const track = document.createElement('div')
  track.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect
  const hook = renderHook(() => useBarDrag<'move'>({ trackRef: { current: track }, view, enabled: () => true, onCommit, onClick: () => {} }))
  const press = () => act(() => hook.result.current.begin('move')({ button: 0, clientX: 0, stopPropagation() {} } as never))
  return { hook, onCommit, press }
}
const fire = (type: string, clientX = 0) => act(() => { window.dispatchEvent(Object.assign(new Event(type), { clientX })) })

describe('dragging a timeline bar', () => {
  it('commits the days moved on release', () => {
    const { onCommit, press } = setup()
    press(); fire('pointermove', 300); fire('pointerup')
    expect(onCommit).toHaveBeenCalledWith('move', 3)
  })

  it('commits nothing when the browser cancels the drag, and leaves no listener behind', () => {
    const { onCommit, press } = setup()
    press(); fire('pointermove', 300); fire('pointercancel')
    fire('pointermove', 600); fire('pointerup')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('drops the drag when the timeline unmounts mid-drag', () => {
    const { hook, onCommit, press } = setup()
    press(); fire('pointermove', 300)
    hook.unmount()
    fire('pointerup')
    expect(onCommit).not.toHaveBeenCalled()
  })
})
