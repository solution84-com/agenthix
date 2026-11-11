// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ q: {} as Record<string, unknown>, refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ refetch: h.refetch, dataUpdatedAt: 0, ...h.q }),
  useAction: () => vi.fn(),
  getTimeline: 'getTimeline', updateTaskPlan: 'updateTaskPlan', setTaskSchedule: 'setTaskSchedule',
}))
vi.mock('@agenthix/ui/timeline', async () => ({
  ...(await vi.importActual<object>('@agenthix/ui/timeline')),
  Timeline: ({ data }: { data?: unknown }) => <p>{data ? 'chart' : 'Nothing to show.'}</p>,
}))
vi.mock('../../pages/useNow', () => ({ useNow: () => new Date(2026, 10, 11) }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => true }))
vi.mock('../useHiddenLanes', () => ({ useHiddenLanes: () => [[], vi.fn()] }))
vi.mock('../useTimelineTaskUrl', () => ({ useTimelineTaskUrl: () => ({ open: null, openTask: vi.fn(), openSession: vi.fn(), close: vi.fn() }) }))
vi.mock('../../pages/TaskInToolView', () => ({ TaskInToolView: () => null }))
vi.mock('../../pages/TaskSessionPane', () => ({ TaskSessionPane: () => null }))

import { TimelineScreen } from '../TimelineScreen'

afterEach(() => { cleanup(); h.refetch.mockReset() })

describe('the timeline screen: a read that did not come back @SC-1929', () => {
  it('says the timeline could not be read, with Try again, never "Nothing to show."', () => {
    h.q = { data: undefined, error: new Error('network'), isLoading: false }
    render(<TimelineScreen projectId="p1" initialScale="week" />)
    expect(screen.getByText('The timeline could not be read')).toBeTruthy()
    expect(screen.queryByText('Nothing to show.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.refetch).toHaveBeenCalled()
  })

  it('keeps the chart when the data is held, and says it is not up to date once it is old', () => {
    h.q = { data: { tasks: [] }, error: new Error('network'), isLoading: false }
    render(<TimelineScreen projectId="p1" initialScale="week" />)
    expect(screen.getByText('chart')).toBeTruthy()
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
  })
})
