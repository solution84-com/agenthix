// @vitest-environment jsdom
/** Settings › Task types: each type read across the four states, its ⋯ greyed with why, and a Viewer's view (spec D10). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ mayWork: true, archive: vi.fn(), remove: vi.fn() }))
const col = (id: string, name: string, state: string, defaultForState = true) => ({ id, typeId: 't', name, colour: 'neutral', order: 0, state, defaultForState })
const TYPES = [
  { id: 'task', projectId: 'p1', name: 'Task', icon: 'task', kind: 'TASK', madeFromVersionId: null, archivedAt: null, columns: [col('a', 'Backlog', 'BACKLOG'), col('b', 'To do', 'TODO'), col('c', 'In progress', 'IN_PROGRESS'), col('d', 'Done', 'DONE')] },
  { id: 'feat', projectId: 'p1', name: 'Feature request', icon: 'feature', kind: 'CUSTOM', madeFromVersionId: 'v1', archivedAt: null, columns: [col('e', 'Submitted', 'BACKLOG'), col('f', 'Accepted', 'TODO'), col('g', 'Building', 'IN_PROGRESS'), col('h', 'Testing', 'IN_PROGRESS', false), col('i', 'Shipped', 'DONE')] },
]
const USE = [
  { typeId: 'task', tasks: 12, open: 4, used: true, madeFrom: null, columns: {} },
  { typeId: 'feat', tasks: 3, open: 2, used: true, madeFrom: { title: 'Issues', version: '1.0.0' }, columns: {} },
]
vi.mock('wasp/client/operations', () => ({
  useAction: (a: unknown) => a,
  useQuery: (q: string) => ({ data: q === 'getTaskTypes' ? TYPES : q === 'getTaskTypeUse' ? USE : { mayPublish: false }, refetch: vi.fn() }),
  getTaskTypes: 'getTaskTypes', getTaskTypeUse: 'getTaskTypeUse', getTaskTemplateSource: 'getTaskTemplateSource',
  archiveTaskType: ops.archive, deleteTaskType: ops.remove,
}))
vi.mock('../../../../../shared/hooks/useMayWork', () => ({ useMayWork: () => ops.mayWork }))
// The type's mark is the shared library's, tested there; here it is its name.
vi.mock('@agenthix/ui/tasks', () => ({ TaskTypeMark: ({ type }: { type: { name: string } }) => <span>{type.name} mark</span> }))

import { TaskTypesActions, TaskTypesTab } from '../TaskTypesTab'
import type { SettingsProject } from '../../types'

afterEach(() => { cleanup(); vi.clearAllMocks(); ops.mayWork = true })

const project = { id: 'p1', key: 'WEB', name: 'Website relaunch' } as SettingsProject
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Task types', () => {
  it('reads each type across the four states, with where it came from and its tasks', () => {
    wrap(<TaskTypesTab project={project} />)
    const table = screen.getByRole('table', { name: 'Task types' })
    const row = within(table).getByText('Feature request').closest('[role="row"]') as HTMLElement
    expect(within(row).getByText('From the Library: Issues 1.0.0')).toBeTruthy()
    expect(within(row).getByText('Building')).toBeTruthy()
    expect(within(row).getByText('Testing')).toBeTruthy()
    expect(within(row).getByText('3')).toBeTruthy()
    expect(within(table).getByText('Built in · New task starts here')).toBeTruthy()
  })

  it("greys Task's Delete and a type's Archive while open tasks use it, saying why", () => {
    wrap(<TaskTypesTab project={project} />)
    const table = screen.getByRole('table', { name: 'Task types' })
    fireEvent.click(within(table).getByRole('button', { name: 'Task: more' }))
    const del = screen.getByRole('menuitem', { name: /Delete/ }) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(del.title).toBe('Every project has Task and Epic')
    fireEvent.click(within(table).getByRole('button', { name: 'Feature request: more' }))
    const archive = screen.getByRole('menuitem', { name: /Archive type/ }) as HTMLButtonElement
    expect(archive.disabled).toBe(true)
    expect(archive.title).toBe('Open tasks still use it: change their type first')
  })

  it("greys New task type for a Viewer, with why, and offers Propose to someone who doesn't publish", () => {
    ops.mayWork = false
    wrap(<TaskTypesActions project={project} />)
    const button = screen.getByRole('button', { name: 'New task type' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe("Viewers can't change the project's task types.")
    fireEvent.click(screen.getByRole('button', { name: 'More on task types' }))
    expect(screen.getByRole('menuitem', { name: /Propose as task template/ })).toBeTruthy()
  })
})
