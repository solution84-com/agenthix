// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const search = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({ searchConversationRuns: (...a: unknown[]) => search(...a) }))
vi.mock('react-router', () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))

import { ConversationRunSearch } from '../ConversationRunSearch'

beforeEach(() => search.mockReset())
afterEach(cleanup)

describe('searching what a conversation\'s runs said @SC-973', () => {
  it('asks the sites only when the person asks, not as they type', () => {
    render(<ConversationRunSearch conversationId="c1" query="cache" />)
    expect(search).not.toHaveBeenCalled()
  })

  it('lists the runs that said it, each opening its run, and names the sites it could not reach', async () => {
    search.mockResolvedValue({ hits: [{ runId: 'r1', sessionId: 's1', siteId: 'up', title: 'Profile the pipeline', at: '2026-10-09T10:00:00Z', excerpt: 'the cache was cold' }], unavailable: ['Office Mac'] })
    render(<ConversationRunSearch conversationId="c1" query="cache" />)
    fireEvent.click(screen.getByRole('button', { name: /Search what its runs said/ }))
    await waitFor(() => expect(screen.getByText('the cache was cold')).toBeTruthy())
    expect(search).toHaveBeenCalledWith({ conversationId: 'c1', query: 'cache' })
    expect(screen.getByRole('link').getAttribute('href')).toBe('/runs/r1?session=s1&conversation=c1')
    expect(screen.getByRole('status').textContent).toContain('Office Mac')
  })

  it('shows nothing until there are words to search for', () => {
    const { container } = render(<ConversationRunSearch conversationId="c1" query="" />)
    expect(container.firstChild).toBeNull()
  })
})
