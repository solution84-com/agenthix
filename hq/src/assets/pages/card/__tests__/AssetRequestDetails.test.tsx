// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AssetRequestChange } from '../assetRequestChange'

const h = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: h.data }), getAssetRequestChange: 'getAssetRequestChange' }))

import { AssetRequestDetails } from '../AssetRequestDetails'

afterEach(cleanup)

describe("an agent's request on its approval card (D31)", () => {
  it('shows what a publish would change, file by file, with the agent\'s note', () => {
    h.data = {
      kind: 'publish', identity: 'fernhill/code-review', requestedBy: 'Ada', from: '1.1.0', to: '1.2.0', note: 'Adds a rate-limit step', stale: null,
      changes: [{ path: 'SKILL.md', status: 'modified', before: 'a', after: 'a\nb', binary: false }],
    } satisfies AssetRequestChange
    render(<AssetRequestDetails operationId="o1" />)
    expect(screen.getByText('Ada asks you to publish fernhill/code-review 1.2.0, now 1.1.0')).toBeTruthy()
    expect(screen.getByText(/Its note: “Adds a rate-limit step”/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'SKILL.md' })).toBeTruthy()
    expect(screen.queryByTestId('asset-request-stale')).toBeNull()
  })

  it('says so when the request has gone stale', () => {
    h.data = { kind: 'switchOn', requestedBy: 'Ada', skill: 'deploy-preview', place: 'Website rebuild', stale: "The skill's files have changed since this was asked. Nothing was changed." }
    render(<AssetRequestDetails operationId="o1" />)
    expect(screen.getByTestId('asset-request-stale').textContent).toContain('files have changed')
  })

  it('draws nothing for a request that is not an agent\'s skill request, or while loading', () => {
    h.data = { kind: 'none' }
    const { container } = render(<AssetRequestDetails operationId="o1" />)
    expect(container.innerHTML).toBe('')
    h.data = undefined
    expect(render(<AssetRequestDetails operationId="o1" />).container.innerHTML).toBe('')
  })
})
