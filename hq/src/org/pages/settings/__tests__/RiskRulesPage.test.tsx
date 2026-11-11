// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ q: {} as Record<string, unknown>, refetch: vi.fn(), update: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ refetch: h.refetch, dataUpdatedAt: 0, ...h.q }),
  useAction: () => h.update,
  getSiteConfig: 'getSiteConfig', updateRiskRules: 'updateRiskRules',
}))
vi.mock('../../OrgAdminPage', () => ({
  OrgAdminPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrgAdminHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

import { RiskRulesPage } from '../RiskRulesPage'

afterEach(() => { cleanup(); h.update.mockReset(); h.refetch.mockReset() })

describe('Tool risk rules: a read that did not come back @SC-1929', () => {
  it('shows the nudge in place of the form and offers no Save, so an unread list is never saved', () => {
    h.q = { data: undefined, error: new Error('network') }
    render(<RiskRulesPage />)
    expect(screen.getByText('The tool risk rules could not be read')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save rules' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add rule/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.refetch).toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('keeps the rules and Save when the data is held, with the stale nudge once it is old', async () => {
    h.q = { data: { riskRules: [{ pattern: 'rm -rf', riskLevel: 'HIGH' }] }, error: new Error('network') }
    render(<RiskRulesPage />)
    expect(screen.getByDisplayValue('rm -rf')).toBeTruthy()
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
    h.update.mockResolvedValue({})
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ rules: [{ pattern: 'rm -rf', riskLevel: 'HIGH' }] }))
  })
})
