// @vitest-environment jsdom
/** Settings › Custom fields (spec D4, D16): the fields with their options, a field's options opened, and a Viewer's view. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const opt = (id: string, name: string, colour = 'neutral') => ({ id, fieldId: 'f1', name, colour, order: 0 })
const FIELDS = [
  { id: 'f1', projectId: 'p1', name: 'Launch stage', type: 'SINGLE_SELECT', order: 0, madeFromVersionId: null, archivedAt: null, options: [opt('o1', 'Copy to write'), opt('o2', 'Design', 'accent')] },
  { id: 'f2', projectId: 'p1', name: 'Channel', type: 'SINGLE_SELECT', order: 1, madeFromVersionId: null, archivedAt: new Date(), options: [] },
]
const ops = vi.hoisted(() => ({ mayWork: true, archive: vi.fn(() => Promise.resolve({})), create: vi.fn(() => Promise.resolve({ id: 'f3' })) }))
vi.mock('wasp/client/operations', () => ({
  useAction: (a: unknown) => a,
  useQuery: (q: string) => ({ data: q === 'getCustomFields' ? FIELDS : q === 'getCustomFieldUse' ? { taskCount: 3, boardCount: 1 } : { mayPublish: true }, refetch: vi.fn() }),
  getCustomFields: 'getCustomFields', getCustomFieldUse: 'getCustomFieldUse', getTaskTemplateSource: 'getTaskTemplateSource',
  archiveCustomField: ops.archive, createCustomField: ops.create, deleteCustomField: vi.fn(), renameCustomField: vi.fn(), reorderCustomFields: vi.fn(),
  addFieldOption: vi.fn(), updateFieldOption: vi.fn(), reorderFieldOptions: vi.fn(), removeFieldOption: vi.fn(),
}))
vi.mock('../../../../../shared/hooks/useMayWork', () => ({ useMayWork: () => ops.mayWork }))

import { CustomFieldsActions, CustomFieldsTab } from '../CustomFieldsTab'
import type { SettingsProject } from '../../types'

afterEach(() => { cleanup(); vi.clearAllMocks(); ops.mayWork = true })

const project = { id: 'p1', key: 'WEB', name: 'Website relaunch' } as SettingsProject
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Custom fields', () => {
  it('lists each field with its options, archived ones last, and opens one to its options', () => {
    wrap(<CustomFieldsTab project={project} newOpen={false} onNewClose={vi.fn()} />)
    const list = screen.getByRole('list', { name: 'Custom fields' })
    expect(within(list).getByText('Copy to write')).toBeTruthy()
    expect(within(list).getByText('Archived')).toBeTruthy()
    fireEvent.click(within(list).getAllByRole('button', { name: /^Launch stage/ }).find(b => b.getAttribute('aria-controls') === 'field-f1')!)
    const options = screen.getByRole('list', { name: "Launch stage's options" })
    expect(within(options).getByText('Accent')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add option' })).toBeTruthy()
  })

  it('archives a field from its ⋯, and brings an archived one back', () => {
    wrap(<CustomFieldsTab project={project} newOpen={false} onNewClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Launch stage: more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/ }))
    expect(ops.archive).toHaveBeenCalledWith({ fieldId: 'f1' })
    fireEvent.click(screen.getByRole('button', { name: 'Channel: more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Bring back/ }))
    expect(ops.archive).toHaveBeenCalledWith({ fieldId: 'f2', archived: false })
  })

  it('makes a field with its options, one per line, and refuses a name the project has', () => {
    wrap(<CustomFieldsTab project={project} newOpen onNewClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'channel' } })
    expect((within(dialog).getByRole('button', { name: 'Add field' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Audience' } })
    fireEvent.change(within(dialog).getByLabelText('Options, one per line'), { target: { value: 'Clients\nTeam\n' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add field' }))
    expect(ops.create).toHaveBeenCalledWith({ projectId: 'p1', name: 'Audience', options: [{ name: 'Clients' }, { name: 'Team' }] })
  })

  it('greys New field and every change for a Viewer, saying why, and offers publishing as a task template', () => {
    ops.mayWork = false
    wrap(<><CustomFieldsActions project={project} onNew={vi.fn()} /><CustomFieldsTab project={project} newOpen={false} onNewClose={vi.fn()} /></>)
    const button = screen.getByRole('button', { name: 'New field' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe("Viewers can't change the project's custom fields.")
    fireEvent.click(screen.getByRole('button', { name: 'Launch stage: more' }))
    expect((screen.getByRole('menuitem', { name: 'Rename…' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
