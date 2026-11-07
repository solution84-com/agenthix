// @vitest-environment jsdom
import React, { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { WIDE_TOOL_PX, useWide } from '../useToolParams'
import { DOCK_DEFAULT_WIDTH } from '../../../dock/dockSize'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function Probe({ seen }: { seen: Array<boolean | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  seen.push(useWide(ref))
  return <div ref={ref} />
}

describe('the width of a tool', () => {
  it('knows it is wide at its first layout, so nothing is mounted narrow first and moved', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: WIDE_TOOL_PX + 100 } as DOMRect)
    const seen: Array<boolean | null> = []
    render(<Probe seen={seen} />)
    // Before it is measured it is null, never false: a caller keeps its file's frame out until it knows.
    expect(seen).toEqual([null, true])
  })

  it('is narrow when the element is, and when it cannot be measured', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300 } as DOMRect)
    const seen: Array<boolean | null> = []
    render(<Probe seen={seen} />)
    expect(seen.at(-1)).toBe(false)
    expect(seen).not.toContain(true)
  })

  it('is wide in the smallest desktop window that shows a place\'s full menu, with the chat panel beside it', () => {
    // 1280 px less the rail (72), the place's menu (224) and the chat panel at its default width.
    const canvas = 1280 - 72 - 224 - DOCK_DEFAULT_WIDTH
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: canvas } as DOMRect)
    const seen: Array<boolean | null> = []
    render(<Probe seen={seen} />)
    expect(seen.at(-1)).toBe(true)
  })
})
