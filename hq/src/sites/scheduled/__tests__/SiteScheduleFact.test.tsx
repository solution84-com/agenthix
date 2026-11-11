// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('wasp/client/operations', () => ({ useQuery: ops.useQuery, getScheduledChangeNotices: 'getScheduledChangeNotices' }))

import { SiteScheduleFact } from '../SiteScheduleFact'
import { siteLineFact } from '../noticeWords'

const AT = new Date('2026-10-18T22:00:00Z')
const SITE_NOTICE = {
  key: 'c1:x', kind: 'upgrade', siteName: 'Kitchen Mac', at: AT, expectedMinutes: 20,
  detail: null, told: new Date('2026-10-13T09:00:00Z'), moved: null, projectKeys: ['RAF'],
}

beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('the fact on a project\'s site line, for a scheduled change to its site @SC-1939', () => {
  it('says the time today, and the day otherwise', () => {
    expect(siteLineFact(AT, new Date('2026-10-18T09:00:00Z'), 'UTC')).toBe('maintenance at 22:00')
    expect(siteLineFact(AT, new Date('2026-10-16T09:00:00Z'), 'UTC')).toBe('maintenance on Sun 18 Oct at 22:00')
  })

  it('shows on a project whose site the change touches, and on no other', () => {
    ops.useQuery.mockReturnValue({ data: [SITE_NOTICE] })
    const { rerender } = render(<SiteScheduleFact projectKey="RAF" now={new Date('2026-10-18T09:00:00Z')} />)
    expect(screen.getByTestId('site-schedule-fact').textContent).toContain('maintenance')
    rerender(<SiteScheduleFact projectKey="OTHER" />)
    expect(screen.queryByTestId('site-schedule-fact')).toBeNull()
  })

  it('says nothing for a change to HQ itself, which is no site\'s line', () => {
    ops.useQuery.mockReturnValue({ data: [{ ...SITE_NOTICE, siteName: null, projectKeys: [] }] })
    render(<SiteScheduleFact projectKey="RAF" />)
    expect(screen.queryByTestId('site-schedule-fact')).toBeNull()
  })

  it('is part of the page, never a dialog', () => {
    ops.useQuery.mockReturnValue({ data: [SITE_NOTICE] })
    render(<SiteScheduleFact projectKey="RAF" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
