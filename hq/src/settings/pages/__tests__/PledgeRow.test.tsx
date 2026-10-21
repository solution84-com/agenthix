// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const ops = vi.hoisted(() => ({ data: null as any }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: ops.data }), getMyPledge: 'getMyPledge' }))

import { PledgeRow } from '../PledgeRow'

afterEach(cleanup)

describe("a person's own pledge signature in Settings @SC-1125", () => {
  it('shows the version signed and links to their badge', () => {
    ops.data = { version: 1, currentVersion: 1, badgeUrl: 'https://cloud.example.com/pledge/s/s_8Q2v' }
    render(<PledgeRow />)
    expect(screen.getByText('Signed version 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Your badge/ }).getAttribute('href')).toBe('https://cloud.example.com/pledge/s/s_8Q2v')
  })

  it('says when a newer version is out, and shows nothing without a signature', () => {
    ops.data = { version: 1, currentVersion: 2, badgeUrl: 'https://cloud.example.com/pledge/s/s_8Q2v' }
    render(<PledgeRow />)
    expect(screen.getByText('Signed version 1 · version 2 is out')).toBeTruthy()
    cleanup()
    ops.data = null
    const { container } = render(<PledgeRow />)
    expect(container.textContent).toBe('')
  })
})
