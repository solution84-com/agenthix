import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProgramDetailContent } from '../ProgramDetailContent'
import type { ProgramActions, ProgramDetail } from '../types'

afterEach(cleanup)

const program: ProgramDetail = { id: 'p1', name: 'Launch', slug: 'launch', description: null, projectCount: 0, projects: [] }
const actions = (over: Partial<ProgramActions> = {}): ProgramActions => ({
  updateProgram: vi.fn(), deleteProgram: vi.fn().mockResolvedValue(undefined), createProject: vi.fn().mockResolvedValue(undefined),
  assignProject: vi.fn(), ...over,
})

describe("a programme's page @SC-1936 @SC-1911", () => {
  it('refuses Create before the press when there is no site to create the project on', () => {
    const a = actions()
    render(<ProgramDetailContent program={program} allProjects={[]} actions={a} onProgramDeleted={vi.fn()} sites={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Site' } })
    const create = screen.getByRole('button', { name: 'Create' })
    expect(create.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(create)
    expect(a.createProject).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'There is no site to create it on' })).toBeTruthy()
  })

  it('asks before a delete in the confirm dialog', async () => {
    const a = actions()
    const onProgramDeleted = vi.fn()
    render(<ProgramDetailContent program={program} allProjects={[]} actions={a} onProgramDeleted={onProgramDeleted} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete "Launch"?' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    await waitFor(() => expect(onProgramDeleted).toHaveBeenCalled())
    expect(a.deleteProgram).toHaveBeenCalledWith('p1')
  })
})
