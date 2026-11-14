// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const { data } = vi.hoisted(() => ({ data: { current: {} as Record<string, unknown> } }))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../../test/featuresAnswer')
  const names = ['getUserSettings', 'getVersionInfo', 'getEnvStatus', 'getSiteList', 'getGithubAppStatus', 'getDiagnosticsSummary', 'getWhereHqRuns', 'getFeatures']
  return {
    ...Object.fromEntries(names.map(n => [n, n])),
    useQuery: (op: string) => ({ data: op === 'getFeatures' ? featuresAnswer() : data.current[op], isLoading: false }),
  }
})
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { InfrastructurePage } from '../infrastructure/InfrastructurePage'
import { withFeature } from '@agenthix/core/testing'

beforeEach(() => {
  cleanup()
  data.current = { getUserSettings: { role: 'ADMIN' }, getSiteList: [] }
})

describe('Infrastructure › Logs and diagnostics row @SC-724', () => {
  it('opens the diagnostics page and says how things stand', () => {
    data.current.getDiagnosticsSummary = { errorsLast24h: 6, sitesWithLogs: 2, sites: 3 }
    render(<MemoryRouter><InfrastructurePage /></MemoryRouter>)
    const row = screen.getByText('Logs and diagnostics').closest('a')
    expect(row?.getAttribute('href')).toBe('/admin/infrastructure/diagnostics')
    expect(row?.textContent).toContain('6 errors in the last 24 hours · logs from HQ and 2 sites · support bundle')
  })

  it('links the Execution Sites heading to the list of every site @SC-733', () => {
    render(<MemoryRouter><InfrastructurePage /></MemoryRouter>)
    expect(screen.getByText('All sites').closest('a')?.getAttribute('href')).toBe('/admin/where-work-runs')
  })

  it('says so when there are no errors', () => {
    data.current.getDiagnosticsSummary = { errorsLast24h: 0, sitesWithLogs: 0, sites: 0 }
    render(<MemoryRouter><InfrastructurePage /></MemoryRouter>)
    expect(screen.getByText('Logs and diagnostics').closest('a')?.textContent).toContain('No errors in the last 24 hours · logs from HQ · support bundle')
  })
})

describe('Infrastructure › Where HQ runs while Agenthix Cloud is off (adr-0189) @SC-2124', () => {
  it('says only that HQ is self-hosted, naming no Cloud', () => {
    data.current.getWhereHqRuns = { hosting: 'self', connectedAs: 'Acme Robotics' }
    render(<MemoryRouter><InfrastructurePage /></MemoryRouter>)
    const row = screen.getByText('Where HQ runs').closest('a')
    expect(row?.textContent).toContain('Self-hosted')
    expect(row?.textContent).not.toContain('Cloud')
  })
})

withFeature('cloud', () => {
  describe('Infrastructure › Where HQ runs @SC-1120', () => {
    it('is the first row of HQ, opening the HQ page, and says where HQ runs in a line', () => {
      data.current.getWhereHqRuns = { hosting: 'self', connectedAs: 'Acme Robotics' }
      render(<MemoryRouter><InfrastructurePage /></MemoryRouter>)
      const row = screen.getByText('Where HQ runs').closest('a')
      expect(row?.getAttribute('href')).toBe('/admin/infrastructure/hq')
      expect(row?.textContent).toContain('Self-hosted · connected to Agenthix Cloud as Acme Robotics')
    })
  })
})
