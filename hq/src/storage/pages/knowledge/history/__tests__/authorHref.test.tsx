// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { authorHref } from '../authorLabel'
import { ChangeLine } from '../../ChangeLine'
import type { ChangeAuthorView } from '../../knowledgeTypes'

const byRun: ChangeAuthorView = { kind: 'agent', agentName: 'Kernel', forName: 'Sam', runId: 'run 1' }

describe('the link to where an agent changed a page @SC-1425', () => {
  it('opens a run on the route that takes a run id', () => {
    expect(authorHref(byRun)).toBe('/runs/run%201')
  })

  it('is the same on the page as in History', () => {
    render(<MemoryRouter><ChangeLine linked change={{ at: '2026-10-20T10:00:00Z', by: byRun }} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Kernel, asked by Sam' }).getAttribute('href')).toBe(authorHref(byRun))
  })
})
