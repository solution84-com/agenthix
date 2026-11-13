// @vitest-environment jsdom
// Where HQ has no host name for uploaded files, its page says they are downloads only (host-management spec §16).
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { data } = vi.hoisted(() => ({ data: { current: {} as Record<string, unknown> } }))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../../test/featuresAnswer')
  return {
    getVersionInfo: 'getVersionInfo',
    getEnvStatus: 'getEnvStatus',
    getWhereHqRuns: 'getWhereHqRuns',
    getFeatures: 'getFeatures',
    useQuery: (op: string) => ({ data: op === 'getFeatures' ? featuresAnswer() : data.current[op], isLoading: false }),
  }
})
vi.mock('../OrgAdminPage', () => ({
  OrgAdminPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrgAdminHeading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))
vi.mock('../infrastructure/InstallationIdentity', () => ({ InstallationIdentity: () => null }))

import { HqPage } from '../infrastructure/HqPage'
import { withFeature } from '@agenthix/core/testing'

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

describe('HQ page › where HQ runs while Agenthix Cloud is off (adr-0189)', () => {
  it('has no such block, and names no Cloud', () => {
    data.current.getWhereHqRuns = { hosting: 'self', connectedAs: null }
    render(<HqPage />)
    expect(screen.queryByRole('region', { name: 'Where HQ runs' })).toBeNull()
    expect(document.body.textContent).not.toContain('Cloud')
  })
})

withFeature('cloud', () => {
  describe('HQ page › where HQ runs @SC-1120', () => {
    it('says it is self-hosted and not connected, and links no guide page while Cloud is not announced', () => {
      data.current.getWhereHqRuns = { hosting: 'self', connectedAs: null }
      render(<HqPage />)
      expect(screen.getByText('Self-hosted')).toBeTruthy()
      expect(screen.getByText('Not connected')).toBeTruthy()
      expect(screen.getByText(/on HQ's page in the Fleet Console/)).toBeTruthy()
      expect(screen.queryByRole('link', { name: /About Agenthix Cloud/ })).toBeNull()
    })
  })
})
