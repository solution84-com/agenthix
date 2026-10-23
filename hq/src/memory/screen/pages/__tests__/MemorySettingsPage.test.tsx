// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery, getMemoryMeasurements: 'getMemoryMeasurements',
}))
vi.mock('../../../../org/pages/OrgAdminPage', () => ({
  OrgAdminPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrgAdminHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

import { MemorySettingsPage } from '../MemorySettingsPage'

const MEASURED = {
  included: 12, hinted: 4, recalled: 6, used: 9, unused: 3, missed: 2,
  certainBar: 0.62, probableBar: 0.45,
}

beforeEach(() => {
  vi.clearAllMocks()
  ops.useQuery.mockReturnValue({ data: MEASURED })
})

describe('MemorySettingsPage @SC-991', () => {
  it('shows each figure and the share relied on', () => {
    render(<MemorySettingsPage />)
    expect(screen.getByText('Agents relied on 75% of the memories they were given. Recall tuning: certain at 0.62, probable at 0.45.')).toBeTruthy()
    for (const [label, n] of [['Included in a reply', '12'], ['Named as a hint', '4'], ['Recalled on request', '6'], ['Relied on', '9'], ['Not relied on', '3'], ['Missed', '2']]) {
      expect(screen.getByText(label).previousSibling?.textContent).toBe(n)
    }
  })
})
