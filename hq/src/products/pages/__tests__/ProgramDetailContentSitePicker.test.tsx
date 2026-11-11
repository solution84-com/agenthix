// @vitest-environment jsdom
/**
 * @SC-287 Project creation from the Program detail page offers the site picker
 *
 * ProgramDetailContent (from @agenthix/ui/programs) renders its own inline
 * "New Project" form rather than CreateProjectModal. Nothing exercised its
 * submit handler, which is how it shipped without a siteId and started
 * failing once hq's createProject action began requiring one. This renders
 * the real component (not a mock) to prove the fix.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { ProgramDetailContent } from '@agenthix/ui/programs'
import type { ProgramDetail } from '@agenthix/ui/programs'

const program: ProgramDetail = {
  id: 'prog-1',
  name: 'Program One',
  slug: 'program-one',
  description: null,
  projectCount: 0,
  projects: [],
}

const sites = [
  { siteId: 's1', name: 'Site One', status: 'ONLINE' },
  { siteId: 's2', name: 'Site Two', status: 'ONLINE' },
]

describe('ProgramDetailContent — site picker on project creation @SC-287 @SC-1931', () => {
  it('passes the chosen siteId to actions.createProject', async () => {
    const createProject = vi.fn().mockResolvedValue(undefined)
    render(
      <ProgramDetailContent
        program={program}
        allProjects={[]}
        actions={{
          updateProgram: vi.fn(),
          deleteProgram: vi.fn(),
          createProject,
          assignProject: vi.fn(),
        }}
        onProgramDeleted={vi.fn()}
        sites={sites}
      />,
    )

    fireEvent.click(screen.getByText('+ New'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's2' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A New Project' } })

    const form = screen.getByText('New Project').closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: 's2', programId: 'prog-1', name: 'A New Project' }),
      )
    })
  })

  it('refuses Create before the press without a site, saying why when it is pressed', async () => {
    const createProject = vi.fn().mockResolvedValue(undefined)
    render(
      <ProgramDetailContent
        program={program}
        allProjects={[]}
        actions={{
          updateProgram: vi.fn(),
          deleteProgram: vi.fn(),
          createProject,
          assignProject: vi.fn(),
        }}
        onProgramDeleted={vi.fn()}
        sites={[]}
      />,
    )

    fireEvent.click(screen.getByText('+ New'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A New Project' } })

    const create = screen.getByRole('button', { name: 'Create' })
    expect(create.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(create)

    expect(screen.getByRole('dialog', { name: 'There is no site to create it on' })).toBeTruthy()
    expect(createProject).not.toHaveBeenCalled()
  })
})
