// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ error: null as unknown, data: undefined as unknown, reopen: vi.fn(), args: [] as unknown[] }))
vi.mock('wasp/client/operations', () => ({
  getArchivedConversations: 'getArchivedConversations',
  reopenConversation: (...a: unknown[]) => h.reopen(...a),
  useQuery: (_op: unknown, args: unknown) => { h.args.push(args); return { data: h.data, isLoading: false, error: h.error, dataUpdatedAt: 0, refetch: () => undefined } },
}))
vi.mock('react-router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
const uiLucide = vi.hoisted(() => require('node:module').createRequire(require.resolve('@agenthix/ui/primitives')).resolve('lucide-react'))
vi.mock(uiLucide, async (importOriginal) => ({ ...(await importOriginal<object>()), Search: () => null }))

import { ArchivedConversations } from '../ArchivedConversations'

const row = (id: string, title: string) => ({ id, title, home: 'PROJECT', projectId: 'p1', taskId: null, status: 'ARCHIVED', closedReason: null, agent: { id: 'a', name: 'Frontend dev', handle: 'fd', avatarUrl: null }, lastMessageAt: '2026-07-01T10:00:00Z' })

beforeEach(() => { h.error = null; h.args.length = 0; h.reopen.mockReset().mockResolvedValue(undefined); h.data = { conversations: [row('c1', 'Pricing page')] } })
afterEach(cleanup)

describe('the archived conversations of a place @SC-974 @SC-1929', () => {
  it('asks for them only once opened', () => {
    render(<ArchivedConversations home="PROJECT" projectId="p1" hrefOf={(id) => `/c/${id}`} />)
    expect(h.args).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Archived conversations' }))
    expect(h.args[0]).toEqual({ home: 'PROJECT', projectId: 'p1', query: undefined })
    expect(screen.getByText('Pricing page')).toBeTruthy()
  })

  it('searches them and reopens one with a tap', async () => {
    render(<ArchivedConversations home="PROJECT" projectId="p1" hrefOf={(id) => `/c/${id}`} />)
    fireEvent.click(screen.getByRole('button', { name: 'Archived conversations' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'price' } })
    expect(h.args[h.args.length - 1]).toMatchObject({ query: 'price' })
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(h.reopen).toHaveBeenCalledWith({ conversationId: 'c1' }))
  })

  it('puts the not-up-to-date line after the last row, so no row moves', () => {
    h.error = new Error('Network Error')
    render(<ArchivedConversations home="PROJECT" projectId="p1" hrefOf={(id) => `/c/${id}`} />)
    fireEvent.click(screen.getByRole('button', { name: 'Archived conversations' }))
    expect(screen.getByTestId('archived-row').compareDocumentPosition(screen.getByText(/Not up to date/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says when nothing is archived', () => {
    h.data = { conversations: [] }
    render(<ArchivedConversations home="PERSON" hrefOf={(id) => `/c/${id}`} />)
    fireEvent.click(screen.getByRole('button', { name: 'Archived conversations' }))
    expect(screen.getByText('Nothing is archived here.')).toBeTruthy()
  })
})
