// @vitest-environment jsdom
import React, { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { WIDE_TOOL_PX, useWide } from '../useToolParams'

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
})
