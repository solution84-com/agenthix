// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { FeaturesAnswer, FeatureRow } from '../../../shared/features'

const mocks = vi.hoisted(() => ({ answer: undefined as unknown, save: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  getFeatures: 'getFeatures', setFeature: 'setFeature',
  useQuery: () => ({ data: mocks.answer }),
  useAction: () => mocks.save,
}))
vi.mock('../../../org/pages/OrgAdminPage', () => ({
  OrgAdminPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  OrgAdminHeading: ({ title, children }: { title: string; children?: React.ReactNode }) => <header><h1>{title}</h1>{children}</header>,
}))

import { FeaturesPage, changedLine, featureGroups } from '../FeaturesPage'

const row = (over: Partial<FeatureRow>): FeatureRow => ({
  flag: 'marketplace', stage: 'preview', on: false, onByDefault: false, switchable: false, shownInProduction: false,
  changed: null, ...over,
})
const answer = (development: boolean, flags: FeatureRow[]): FeaturesAnswer => ({ development, isAdmin: true, flags })

beforeEach(() => { mocks.save.mockReset().mockResolvedValue(undefined) })
afterEach(cleanup)

describe('Organisation › Settings › Features', () => {
  it('in production lists only beta and newly released features, beta explained @SC-1765', () => {
    mocks.answer = answer(false, [
      row({ flag: 'marketplace', stage: 'beta', shownInProduction: true, switchable: true }),
      row({ flag: 'usageBilling', stage: 'preview' }),
    ])
    render(<FeaturesPage />)
    expect(screen.getByTestId('feature-marketplace')).toBeTruthy()
    expect(screen.queryByTestId('feature-usageBilling')).toBeNull()
    expect(screen.getByLabelText('What the stages mean').textContent).toContain('Beta')
    expect(screen.getByLabelText('What the stages mean').textContent).not.toContain('Experimental')
  })

  it('says there is nothing to try when production lists none @SC-1765', () => {
    mocks.answer = answer(false, [row({ stage: 'preview' })])
    render(<FeaturesPage />)
    expect(screen.getByText(/There is nothing to try right now/)).toBeTruthy()
  })

  it('in a development build lists every flag by stage, explains all four, and switches any @SC-1766', async () => {
    mocks.answer = answer(true, [
      row({ flag: 'marketplace', stage: 'preview', on: true, onByDefault: true, switchable: true }),
      row({ flag: 'usageBilling', stage: 'preview', on: true, onByDefault: true, switchable: true }),
    ])
    render(<FeaturesPage />)
    expect(screen.getByRole('region', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByLabelText('What the stages mean').textContent).toContain('Experimental')
    fireEvent.click(screen.getByRole('switch', { name: 'Marketplace is on' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ flag: 'marketplace', on: false }))
  })

  it('offers no switch for a flag this build cannot switch @SC-1766', () => {
    mocks.answer = answer(false, [row({ stage: 'released', shownInProduction: true, on: true, switchable: false })])
    render(<FeaturesPage />)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a refusal as it came @SC-1767', async () => {
    mocks.answer = answer(false, [row({ stage: 'beta', shownInProduction: true, switchable: true })])
    mocks.save.mockRejectedValue(new Error('Only an organisation admin can switch a feature. Ask one of them. Nothing was changed.'))
    render(<FeaturesPage />)
    fireEvent.click(screen.getByRole('switch'))
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing was changed.')
  })
})

describe('the words beside each feature', () => {
  it('names who switched it, or its default @SC-1765', () => {
    expect(changedLine(row({ on: true, changed: { by: 'Sam', at: '2026-11-03T10:00:00Z' } }))).toMatch(/^Switched on by Sam on /)
    expect(changedLine(row({ on: false, changed: { by: null, at: '2026-11-03T10:00:00Z' } }))).toMatch(/by someone no longer here/)
    expect(changedLine(row({ onByDefault: true }))).toBe('On by default')
  })

  it('groups in stage order @SC-1766', () => {
    const groups = featureGroups(answer(true, [row({ flag: 'usageBilling', stage: 'released' }), row({ stage: 'experimental' })]))
    expect(groups.map(g => g.stage)).toEqual(['experimental', 'released'])
  })
})
