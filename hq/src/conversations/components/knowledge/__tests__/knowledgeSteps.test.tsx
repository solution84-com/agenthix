// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { BRANDING } from '@agenthix/core'

const h = vi.hoisted(() => ({ restore: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useAction: (fn: (a: unknown) => unknown) => fn,
  restoreKnowledgeVersion: (a: unknown) => h.restore(a),
}))

import { KnowledgeStepRow } from '../KnowledgeStepRow'
import { ThinkingSteps } from '../../ThinkingPill'
import { seeChangeHref, titleOfStep, type ChangeStep } from '../knowledgeSteps'

const change: ChangeStep = {
  kind: 'knowledge_change', level: 'org', owner: { ownerType: 'org', ownerId: 'org' }, page: 'ops/release-process.md',
  title: 'Release process', change: 'edited', versionId: 'v9', previousVersionId: 'v8', summary: 'Staging deploys now need Mia\'s approval',
}
const show = (data: Parameters<typeof KnowledgeStepRow>[0]['data'], placePath?: string) =>
  render(<MemoryRouter><KnowledgeStepRow data={data} placePath={placePath} /></MemoryRouter>)

beforeEach(() => h.restore.mockReset().mockResolvedValue({ outcome: 'done' }))
afterEach(cleanup)

describe('the step\'s words and addresses @SC-1416', () => {
  it('titles a page from its file name when the step has no title', () => {
    expect(titleOfStep({ page: 'ops/release-process.md', title: '' })).toBe('Release process')
    expect(titleOfStep({ page: 'x.md', title: 'Release process' })).toBe('Release process')
  })

  it('opens History at the version, in the organisation\'s Knowledge or the conversation\'s place', () => {
    expect(seeChangeHref(change, '/projects/WEB')).toBe('/org/knowledge?tool=knowledge&page=ops%2Frelease-process.md&view=history&history=v9')
    const mine = { ...change, owner: { ownerType: 'project' as const, ownerId: 'p1' } }
    expect(seeChangeHref(mine, '/projects/WEB')).toBe('/projects/WEB?tool=knowledge&page=ops%2Frelease-process.md&view=history&history=v9')
    expect(seeChangeHref(mine, undefined)).toBeNull()
    expect(seeChangeHref({ ...change, versionId: undefined }, '/projects/WEB')).toBeNull()
  })
})

describe('Updated page @SC-1416', () => {
  it('shows the title, what changed in one line, See change and Undo', () => {
    show(change)
    expect(screen.getByText('Updated page · Release process')).toBeTruthy()
    expect(screen.getByTestId('knowledge-change-summary').textContent).toContain('need Mia')
    expect(screen.getByRole('link', { name: 'See change' }).getAttribute('href')).toContain('history=v9')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('words each kind of change', () => {
    show({ ...change, change: 'created', previousVersionId: undefined })
    expect(screen.getByText('Wrote page · Release process')).toBeTruthy()
  })

  it('undoes by restoring the version before it, in the place the step names, once', async () => {
    show({ ...change, level: 'website-rebuild', owner: { ownerType: 'project', ownerId: 'p1' } }, '/projects/WEB')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(h.restore).toHaveBeenCalledWith({ owner: { ownerType: 'project', ownerId: 'p1' }, page: 'ops/release-process.md', versionId: 'v8' }))
    expect((await screen.findByTestId('knowledge-undone')).textContent).toBe('Undone')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('shows a refusal, and keeps Undo for another try', async () => {
    h.restore.mockResolvedValue({ outcome: 'refused', reason: 'forbidden', message: 'Only admins change this. Nothing was changed.' })
    show(change)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was changed.')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('has no Undo for a page just created, and no See change for a deleted one', () => {
    show({ ...change, previousVersionId: undefined })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    cleanup()
    show({ ...change, change: 'deleted', versionId: undefined })
    expect(screen.queryByRole('link', { name: 'See change' })).toBeNull()
  })
})

describe('the search and platform steps @SC-1416', () => {
  it('names the places a search covered', () => {
    show({ kind: 'knowledge_search', levels: ['personal', 'org'], names: ['Your space', 'Organisation'] })
    expect(screen.getByTestId('knowledge-search-step').textContent).toBe('Searched Knowledge · Your space · Organisation')
  })

  it('words the platform page with the product\'s name at render time', () => {
    show({ kind: 'platform_page', page: 'your-tools/providers.md', title: 'Providers' })
    expect(screen.getByTestId('platform-page-step').textContent).toBe(`Looked up ${BRANDING.displayName} · Providers`)
  })
})

describe('where the steps mount @SC-1416', () => {
  it('draws a step that carries knowledge as its rows, and every other step as its label', () => {
    render(<MemoryRouter><ThinkingSteps steps={[{ label: 'Recalled 2 items', ms: 400 }, { label: 'Updated page · Release process', knowledge: [change] }]} /></MemoryRouter>)
    expect(screen.getByText(/Recalled 2 items/)).toBeTruthy()
    expect(screen.getByTestId('knowledge-change-step')).toBeTruthy()
  })
})
