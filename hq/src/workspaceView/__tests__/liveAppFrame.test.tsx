// @vitest-environment jsdom
/**
 * A live app is entered once per reload asked, however often the view renders, and a refusal is not asked again. A
 * failure nobody pressed for is never a dialog: retried quietly, then a nudge in place of the frame with Try again.
 */
import { withFeature } from '@agenthix/core/testing'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { LiveAppView } from '../../livePreviews/types'

const opened = vi.hoisted(() => vi.fn())
const answer = vi.hoisted(() => ({ fail: (): never => { throw Object.assign(new Error('This app is not running.'), { statusCode: 409 }) } }))
vi.mock('wasp/client/operations', () => ({
  // Wasp's useAction answers a new function on every render.
  useAction: () => async (args: unknown) => {
    opened(args)
    return answer.fail()
  },
  openLiveApp: 'openLiveApp',
}))
vi.mock('../appFrame', async () => {
  const actual = await vi.importActual<object>('../appFrame')
  return { ...actual, postAppEntry: vi.fn() }
})

import { ReadNudgesHeld } from '@agenthix/ui/attention'
import { LiveAppFrame } from '../components/LiveAppFrame'

const app: LiveAppView = {
  appId: 'a1', name: 'shop', folder: '', command: 'npm run dev', port: 3000, state: 'running',
  since: new Date().toISOString(), detail: null, lastLines: [], address: 'http://p-a1.preview.localhost:4401',
}

const refused = (): never => { throw Object.assign(new Error('This app is not running.'), { statusCode: 409 }) }

beforeEach(() => { opened.mockClear(); answer.fail = refused; vi.useRealTimers() })

withFeature('livePreview', () => {
describe('LiveAppFrame @SC-1697 @SC-1929', () => {
  it('asks once when refused, and says so in place of the frame, not in a dialog', async () => {
    render(<LiveAppFrame livePreviewId="lp1" app={app} reloads={0} />)
    await waitFor(() => expect(screen.getByText('The app could not be opened')).toBeTruthy())
    await new Promise(r => setTimeout(r, 50))
    expect(opened).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('This app is not running.')
  })

  it('retries a passing failure quietly, then offers Try again, which enters afresh', async () => {
    vi.useFakeTimers()
    answer.fail = () => { throw new Error('Network Error') }
    render(<LiveAppFrame livePreviewId="lp1" app={app} reloads={0} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(screen.queryByText('The app could not be opened')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
    expect(opened).toHaveBeenCalledTimes(4)
    const again = screen.getByRole('button', { name: 'Try again' })
    await act(async () => { again.click(); await vi.advanceTimersByTimeAsync(10) })
    expect(opened).toHaveBeenCalledTimes(5)
  })

  it('enters again when a reload is asked', async () => {
    const { rerender } = render(<LiveAppFrame livePreviewId="lp1" app={app} reloads={0} />)
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    rerender(<LiveAppFrame livePreviewId="lp1" app={app} reloads={1} />)
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(2))
  })

  it('says nothing of its own while the frame line says HQ is not answering', async () => {
    render(<ReadNudgesHeld.Provider value><LiveAppFrame livePreviewId="lp1" app={app} reloads={0} /></ReadNudgesHeld.Provider>)
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText('The app could not be opened')).toBeNull()
  })
})
})
