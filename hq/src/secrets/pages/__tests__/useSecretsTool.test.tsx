// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined }),
  getPlaceSecrets: {},
  getPlaceVariables: {},
}))
vi.mock('../SecretsTool', () => ({ SECRETS_REFRESH_MS: 1000, SecretsTool: () => null }))

import { useSecretsTool } from '../useSecretsTool'

describe("a place's Vault section @SC-2117", () => {
  it('is labelled Vault, and keeps the id secrets that its addresses use', () => {
    const { result } = renderHook(() => useSecretsTool({ type: 'project', id: 'p1' }))
    expect(result.current).toMatchObject({ id: 'secrets', label: 'Vault' })
  })
})
