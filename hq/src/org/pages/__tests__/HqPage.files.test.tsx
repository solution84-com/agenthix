// @vitest-environment jsdom
// Where HQ has no host name for uploaded files, its page says they are downloads only (host-management spec §16).
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { data } = vi.hoisted(() => ({ data: { current: {} as Record<string, unknown> } }))
vi.mock('wasp/client/operations', () => ({
  getVersionInfo: 'getVersionInfo',
  getEnvStatus: 'getEnvStatus',
  getWhereHqRuns: 'getWhereHqRuns',
  useQuery: (op: string) => ({ data: data.current[op], isLoading: false }),
}))
vi.mock('../OrgAdminPage', () => ({
  OrgAdminPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrgAdminHeading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))
vi.mock('../infrastructure/InstallationIdentity', () => ({ InstallationIdentity: () => null }))

import { HqPage } from '../infrastructure/HqPage'

const env = (files: { mode: string; origin: string; bareAddress: boolean }) => ({ address: 'http://192.168.1.20:4100', files, sections: [] })

beforeEach(() => {
  cleanup()
  data.current = {}
})

describe('HQ page › uploaded files', () => {
  it('on a bare network address, says uploads are downloads only, and why', () => {
    data.current.getEnvStatus = env({ mode: 'downloadsOnly', origin: 'http://192.168.1.20:4100', bareAddress: true })
    render(<HqPage />)
    expect(screen.getByText('Downloads only')).toBeTruthy()
    expect(screen.getByText(/can have no subdomain/).textContent).toContain('only as downloads, never shown in the browser')
  })

  it('with a files origin, names it and says nothing more', () => {
    data.current.getEnvStatus = env({ mode: 'origin', origin: 'https://files.hq.acme.example', bareAddress: false })
    render(<HqPage />)
    expect(screen.getByText('https://files.hq.acme.example')).toBeTruthy()
    expect(screen.queryByText(/only as downloads/)).toBeNull()
  })
})

describe('HQ page › where HQ runs @SC-1120', () => {
  it('says it is self-hosted and not connected, and links the guide\'s Agenthix Cloud page', () => {
    data.current.getWhereHqRuns = { hosting: 'self', connectedAs: null }
    render(<HqPage />)
    expect(screen.getByText('Self-hosted')).toBeTruthy()
    expect(screen.getByText('Not connected')).toBeTruthy()
    expect(screen.getByText(/on HQ's page in the Fleet Console/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /About Agenthix Cloud/ }).getAttribute('href')).toBe('https://agenthix.com/docs/running-agenthix/agenthix-cloud/')
  })
})
