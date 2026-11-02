// @vitest-environment jsdom
/** A live app is entered once per reload asked, however often the view renders, and a refusal is not asked again. */
import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { LiveAppView } from '../../livePreviews/types'

const opened = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  // Wasp's useAction answers a new function on every render.
  useAction: () => async (args: unknown) => {
    opened(args)
    throw new Error('This app is not running.')
  },
  openLiveApp: 'openLiveApp',
}))
vi.mock('../appFrame', async () => {
  const actual = await vi.importActual<object>('../appFrame')
  return { ...actual, postAppEntry: vi.fn() }
})

import { LiveAppFrame } from '../components/LiveAppFrame'

const app: LiveAppView = {
  appId: 'a1', name: 'shop', folder: '', command: 'npm run dev', port: 3000, state: 'running',
  since: new Date().toISOString(), detail: null, lastLines: [], address: 'http://p-a1.preview.localhost:4401',
}

beforeEach(() => opened.mockClear())

describe('LiveAppFrame @SC-1697', () => {
  it('asks once when refused, even as the refusal renders the view again', async () => {
    const problems: (string | null)[] = []
    function Host() {
      // Each problem reported renders the host again, as the live preview's middle does.
      const [, setProblem] = useState<string | null>(null)
      return <LiveAppFrame livePreviewId="lp1" app={app} reloads={0} onProblem={p => { problems.push(p); setProblem(p) }} />
    }
    render(<Host />)
    await waitFor(() => expect(problems.some(p => p !== null)).toBe(true))
    await new Promise(r => setTimeout(r, 50))
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('enters again when a reload is asked', async () => {
    const { rerender } = render(<LiveAppFrame livePreviewId="lp1" app={app} reloads={0} onProblem={() => {}} />)
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    rerender(<LiveAppFrame livePreviewId="lp1" app={app} reloads={1} onProblem={() => {}} />)
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(2))
  })
})
