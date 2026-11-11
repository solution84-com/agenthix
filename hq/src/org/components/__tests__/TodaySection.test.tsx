// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => h.query, getTodayNumbers: 'getTodayNumbers' }))

import { TodaySection } from '../TodaySection'

afterEach(cleanup)

describe('Today @SC-1932', () => {
  it('draws the nudge in place of the cards when the first read failed', () => {
    h.query = { data: undefined, error: new Error('x'), dataUpdatedAt: 0, refetch: vi.fn() }
    render(<MemoryRouter><TodaySection /></MemoryRouter>)
    expect(screen.getByText(/Today's numbers could not be read/)).toBeTruthy()
    expect(screen.queryByText('running now')).toBeNull()
  })
})
