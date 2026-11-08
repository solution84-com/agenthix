// @vitest-environment jsdom
/** An epic's Tasks tab draws its tasks with the task lists' own row, its done ones folded, and no second Add a task. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ asked: null as unknown, rows: [] as unknown[] }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (_q: unknown, args: unknown) => { h.asked = args; return { data: { rows: h.rows, hasMore: false }, isLoading: false } },
  useAction: () => vi.fn().mockResolvedValue(undefined),
  getTaskList: 'getTaskList', runTask: 'runTask', updateTask: 'updateTask',
}))
vi.mock('../../hooks/useProjectAgents', () => ({ useProjectAgents: () => [] }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => true, VIEWER_CANNOT_WORK: 'Viewer' }))

import { EpicTasks } from '../TaskEpic'

afterEach(cleanup)

const row = (over: Record<string, unknown>) => ({
  id: String(over.key), key: 'WEB-1', number: 1, title: 'A task', priority: 'MEDIUM', state: 'TODO', executionState: 'NOT_STARTED',
  type: { name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: 'c1', name: 'To do' }, isEpic: false,
  project: { id: 'p1', key: 'WEB', name: 'Website relaunch' }, agent: { id: 'a1', name: 'Writer', handle: 'writer' },
  runDetail: null, epic: { id: 'e1', title: 'Launch the new website' }, sprint: null, due: null, late: false, fields: {},
  updatedAt: '2026-11-05T10:00:00Z', createdAt: '2026-11-01T10:00:00Z', progress: null, ...over,
})

describe("an epic's Tasks tab", () => {
  it('asks the task list for the epic, draws open tasks as list rows, and folds the done ones', () => {
    h.rows = [row({ key: 'WEB-3', title: 'Done one', state: 'DONE' }), row({ key: 'WEB-2', title: 'Write the home page copy' })]
    render(<MemoryRouter><EpicTasks epicId="e1" projectId="p1" now={new Date(2026, 10, 6)} /></MemoryRouter>)
    expect(h.asked).toMatchObject({ projectId: 'p1', epicId: 'e1', sort: 'rank' })
    expect(within(screen.getByRole('list')).getByRole('button', { name: 'Write the home page copy' })).toBeTruthy()
    expect(screen.getAllByText('Medium').length).toBe(1)
    expect(screen.queryByText('Done one')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 done' }))
    expect(screen.getByText('Done one')).toBeTruthy()
    expect(screen.queryByText(/Add a task/)).toBeNull()
  })

  it('says so when no task is filed under it', () => {
    h.rows = []
    render(<MemoryRouter><EpicTasks epicId="e1" projectId="p1" now={new Date(2026, 10, 6)} /></MemoryRouter>)
    expect(screen.getByText('No tasks are filed under this epic yet.')).toBeTruthy()
  })
})
