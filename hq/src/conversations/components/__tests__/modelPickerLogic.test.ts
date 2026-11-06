import { describe, expect, it } from 'vitest'
import type { ModelChoice } from '../../../shared/conversations/protocol'
import { GROUP_SIZE, PICKER_MIN_HEIGHT, costWords, moveHighlight, pickerPlacement, pickerRows } from '../modelPickerLogic'

const m = (value: string, maker: string, via = 'via OpenRouter', price: 1 | 2 | 3 = 2): ModelChoice =>
  ({ value, label: value.toUpperCase(), maker, via, price })

const anthropic = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5'].map(v => m(v, 'Anthropic'))
const deepseek = [m('deepseek-v4', 'DeepSeek', 'the organisation\'s key', 1), m('deepseek-v3', 'DeepSeek')]
const all = [...anthropic, ...deepseek]

describe('the picker rows @SC-953', () => {
  it('groups by maker, in the order given, showing the first few of each', () => {
    const rows = pickerRows(all, [], '', new Set())
    expect(rows.groups.map(g => g.maker)).toEqual(['Anthropic', 'DeepSeek'])
    expect(rows.groups[0].shown).toHaveLength(GROUP_SIZE)
    expect(rows.groups[0].hidden).toBe(2)
    expect(rows.groups[1].hidden).toBe(0)
  })

  it('puts the access beside the group, naming each when they differ', () => {
    const rows = pickerRows(all, [], '', new Set())
    expect(rows.groups[0].via).toBe('via OpenRouter')
    expect(rows.groups[1].via).toBe("the organisation's key, via OpenRouter")
  })

  it('shows every model of an expanded maker', () => {
    const rows = pickerRows(all, [], '', new Set(['Anthropic']))
    expect(rows.groups[0].shown).toHaveLength(5)
    expect(rows.groups[0].hidden).toBe(0)
  })

  it('lists the recent models first, and walks them before the groups', () => {
    const rows = pickerRows(all, [deepseek[0]], '', new Set())
    expect(rows.recent).toEqual([deepseek[0]])
    expect(rows.flat[0]).toBe(deepseek[0])
    expect(rows.flat).toHaveLength(1 + GROUP_SIZE + 2)
  })

  it('matches any part of a name, ignoring case, lists every match grouped, and drops Recent', () => {
    const rows = pickerRows(all, [deepseek[0]], 'SONN', new Set())
    expect(rows.recent).toEqual([])
    expect(rows.groups).toHaveLength(1)
    expect(rows.groups[0].shown.map(x => x.value)).toEqual(['claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5'])
    expect(rows.groups[0].hidden).toBe(0)
  })

  it('also matches the maker', () => {
    expect(pickerRows(all, [], 'deepseek', new Set()).flat).toHaveLength(2)
  })

  it('puts the models recommended here first, then the recent ones without repeating them, and walks them in that order', () => {
    const rows = pickerRows(all, [anthropic[0], deepseek[0]], '', new Set(), [{ ...anthropic[0] }])
    expect(rows.recommended.map(x => x.value)).toEqual(['claude-sonnet-5'])
    expect(rows.recent.map(x => x.value)).toEqual(['deepseek-v4'])
    expect(rows.flat.slice(0, 2).map(x => x.value)).toEqual(['claude-sonnet-5', 'deepseek-v4'])
  })

  it('drops the recommended models too while searching', () => {
    expect(pickerRows(all, [], 'deepseek', new Set(), [anthropic[0]]).recommended).toEqual([])
  })

  it('has no rows for a search nothing matches', () => {
    expect(pickerRows(all, [], 'zzz', new Set()).flat).toEqual([])
  })
})

describe('the keys and hint @SC-953', () => {
  it('moves the highlight and wraps at both ends', () => {
    expect(moveHighlight(0, 'ArrowDown', 3)).toBe(1)
    expect(moveHighlight(2, 'ArrowDown', 3)).toBe(0)
    expect(moveHighlight(0, 'ArrowUp', 3)).toBe(2)
    expect(moveHighlight(0, 'ArrowDown', 0)).toBe(0)
  })

  it('writes the cost in words', () => {
    expect([1, 2, 3].map(p => costWords(p as 1 | 2 | 3))).toEqual(['Low cost', 'Medium cost', 'High cost'])
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
