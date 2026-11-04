// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  restore: vi.fn(),
  del: vi.fn(),
  deleted: undefined as unknown,
}))
const NOW = '2026-10-25T10:00:00.000Z'
const TEXTS: Record<string, string> = {
  now: '---\ntitle: Release\ndescription: d\ntags: [releases, deploys]\n---\nStaging needs approval.',
  v2: '---\ntitle: Release\ndescription: d\ntags: [releases]\n---\nStaging deploys go out after checks.',
  v1: '---\ntitle: Release\ndescription: d\n---\nFirst.',
}
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string, args: { versionId?: string }) => {
    if (q === 'getKnowledgePage') {
      const content = TEXTS[args.versionId ?? 'now']
      return { data: { page: 'release.md', content, version: args.versionId ?? 'vnow', lastChange: { at: NOW, by: { kind: 'agent', agentName: 'Kernel', forName: 'Sam', conversationId: 'c9' } } }, isLoading: false, error: null }
    }
    if (q === 'knowledgePageVersions') {
      return { data: { versions: [
        { id: 'v2', version: 'h2', savedAt: '2026-10-20T10:00:00.000Z', by: { kind: 'person', name: 'Mia' } },
        { id: 'v1', version: 'h1', savedAt: '2026-10-08T10:00:00.000Z', by: { kind: 'person', name: 'Sam' } },
      ] }, isLoading: false, error: null }
    }
    return { data: h.deleted, isLoading: false, error: null }
  },
  useAction: (fn: (a: unknown) => unknown) => fn,
  getKnowledgePage: 'getKnowledgePage', knowledgePageVersions: 'knowledgePageVersions', recentlyDeletedKnowledge: 'recentlyDeletedKnowledge',
  restoreKnowledgeVersion: (a: unknown) => h.restore(a),
  deleteKnowledgePage: (a: unknown) => h.del(a),
}))

import { PageHistory } from '../PageHistory'
import { RecentlyDeleted } from '../RecentlyDeleted'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const now = new Date('2026-10-25T12:00:00.000Z')
const history = (canChange = true, initialVersionId?: string) =>
  render(<MemoryRouter><PageHistory owner={owner} page="release.md" canChange={canChange} initialVersionId={initialVersionId} onBack={() => {}} now={now} /></MemoryRouter>)

beforeEach(() => {
  h.restore.mockReset().mockResolvedValue({ outcome: 'done' })
  h.del.mockReset().mockResolvedValue({ outcome: 'done' })
})
afterEach(cleanup)

describe('a page\'s history', () => {
  it('lists versions newest first with who, an agent naming the person it answered and linking to the conversation @SC-1425', () => {
    history()
    const rows = within(screen.getByRole('list', { name: 'Versions' })).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Kernel, asked by Sam')
    expect(within(rows[0]).getByRole('link', { name: 'the conversation' }).getAttribute('href')).toBe('/chat/t/c9')
    expect(rows[1].textContent).toContain('Mia')
    expect(rows[2].textContent).toContain('created')
  })

  it('shows what the newest version changed: the tag and the line @SC-1425', () => {
    history()
    expect(screen.getByTestId('field-changes').textContent).toContain('tags: releases, deploys (was: releases)')
    expect(screen.getByTestId('diff-del').textContent).toContain('Staging deploys go out after checks.')
    expect(screen.getByTestId('diff-add').textContent).toContain('Staging needs approval.')
  })

  it('has no Restore on the page as it is now @SC-1425', () => {
    history()
    expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull()
  })

  it('opens at the version asked for, and restoring it saves it through the restore operation @SC-1425', async () => {
    history(true, 'v2')
    expect(screen.getByRole('button', { name: /Mia/ }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }))
    await waitFor(() => expect(h.restore).toHaveBeenCalledWith({ owner, page: 'release.md', versionId: 'v2' }))
  })

  it('asks once before deleting a version for good, and does nothing on Cancel @SC-1424', async () => {
    history(true, 'v2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete this version permanently' }))
    fireEvent.click(within(screen.getByTestId('confirm-for-good')).getByRole('button', { name: 'Cancel' }))
    expect(h.del).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete this version permanently' }))
    fireEvent.click(within(screen.getByTestId('confirm-for-good')).getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(h.del).toHaveBeenCalledWith({ owner, page: 'release.md', permanently: true, versionId: 'v2' }))
  })

  it('shows a refusal in words and leaves things as they were @SC-1425', async () => {
    h.restore.mockResolvedValue({ outcome: 'refused', reason: 'forbidden', message: 'Only organisation admins change this. Nothing was changed.' })
    history(true, 'v2')
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was changed.')
  })

  it('offers no way to change anything to someone who may not @SC-1425', () => {
    history(false, 'v2')
    expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete this version permanently' })).toBeNull()
  })
})

describe('recently deleted', () => {
  const deleted = [{ page: 'api/old-api-notes.md', deletedAt: '2026-10-22T10:00:00.000Z', by: { kind: 'agent', agentName: 'Kernel', forName: 'Mia' }, removeAfter: '2026-11-21T10:00:00.000Z', versionId: 'd1' }]
  const open = (canChange = true) => render(<MemoryRouter><RecentlyDeleted owner={owner} canChange={canChange} onBack={() => {}} now={now} /></MemoryRouter>)

  it('says who deleted it, when, and when it will be removed @SC-1423', () => {
    h.deleted = { pages: deleted }
    open()
    const row = screen.getByTestId('deleted-row')
    expect(row.textContent).toContain('api/old-api-notes.md')
    expect(row.textContent).toContain('Kernel, asked by Mia')
    expect(row.textContent).toContain('removed in 27 days')
  })

  it('restores a page by its kept version @SC-1423', async () => {
    h.deleted = { pages: deleted }
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(h.restore).toHaveBeenCalledWith({ owner, page: 'api/old-api-notes.md', versionId: 'd1' }))
  })

  it('deletes for good only after the confirming step @SC-1424', async () => {
    h.deleted = { pages: deleted }
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(h.del).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByTestId('confirm-for-good')).getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(h.del).toHaveBeenCalledWith({ owner, page: 'api/old-api-notes.md', permanently: true }))
  })

  it('says when more pages were deleted than it lists, and not otherwise', () => {
    h.deleted = { pages: deleted, truncated: true }
    open()
    expect(screen.getByTestId('deleted-truncated').textContent).toContain('More pages were deleted than are listed')
    cleanup()
    h.deleted = { pages: deleted, truncated: false }
    open()
    expect(screen.queryByTestId('deleted-truncated')).toBeNull()
  })

  it('says so when nothing was deleted, and offers nothing to someone who may not change @SC-1423', () => {
    h.deleted = { pages: [] }
    open()
    expect(screen.getByText('Nothing was deleted lately.')).toBeTruthy()
    cleanup()
    h.deleted = { pages: deleted }
    open(false)
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })
})
