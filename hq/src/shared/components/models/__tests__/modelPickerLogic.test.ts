import { describe, expect, it } from 'vitest'
import { PICKER_MIN_HEIGHT, moveHighlight, pickerPlacement } from '../modelPickerLogic'

describe('the keys @SC-953', () => {
  it('moves the highlight and wraps at both ends', () => {
    expect(moveHighlight(0, 'ArrowDown', 3)).toBe(1)
    expect(moveHighlight(2, 'ArrowDown', 3)).toBe(0)
    expect(moveHighlight(0, 'ArrowUp', 3)).toBe(2)
    expect(moveHighlight(0, 'ArrowDown', 0)).toBe(0)
  })
})

describe('pickerPlacement @SC-953', () => {
  const bounds = { top: 50, bottom: 800 }

  it('opens on the preferred side, as tall as the room there allows', () => {
    expect(pickerPlacement({ top: 700, bottom: 730 }, bounds, true)).toEqual({ above: true, maxHeight: 420 })
    expect(pickerPlacement({ top: 300, bottom: 330 }, { top: 50, bottom: 450 }, true)).toEqual({ above: true, maxHeight: 242 })
  })

  it('opens on the other side when the preferred one is short and the other has more room', () => {
    expect(pickerPlacement({ top: 150, bottom: 180 }, bounds, true)).toEqual({ above: false, maxHeight: 420 })
    expect(pickerPlacement({ top: 600, bottom: 630 }, bounds, false)).toEqual({ above: true, maxHeight: 420 })
  })

  it('never answers a height below the floor', () => {
    expect(pickerPlacement({ top: 60, bottom: 790 }, bounds, true).maxHeight).toBe(PICKER_MIN_HEIGHT)
  })
})
