// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ title, breadcrumbs, children }: { title: string; breadcrumbs: Array<{ label: string }>; children: React.ReactNode }) =>
    <div><nav>{breadcrumbs.map(b => b.label).join(' > ')}</nav><h1>{title}</h1>{children}</div>,
}))
const tool = vi.hoisted(() => vi.fn())
vi.mock('../../../storage/pages/KnowledgeTool', () => ({ KnowledgeTool: (p: { owner: unknown }) => { tool(p.owner); return <div>the knowledge tool</div> } }))

import { OrgKnowledgePage } from '../OrgKnowledgePage'

afterEach(cleanup)

describe('Organisation knowledge @SC-1431', () => {
  it('shows the Knowledge tool with the organisation as its place, under Organisation', () => {
    render(<MemoryRouter><OrgKnowledgePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Knowledge' })).toBeTruthy()
    expect(screen.getByText('Organisation > Knowledge')).toBeTruthy()
    expect(screen.getByText('the knowledge tool')).toBeTruthy()
    expect(tool).toHaveBeenCalledWith({ ownerType: 'org' })
  })
})
