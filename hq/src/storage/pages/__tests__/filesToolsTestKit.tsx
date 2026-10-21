/** Shared mocks of the Files tools' screens: the address, the data hooks, and the site-backed neighbours. */
import { vi } from 'vitest'
import type { ListedEntry, KnowledgeTopic } from '@agenthix/ui/projects'

export const address = { params: new URLSearchParams(), listeners: new Set<() => void>() }

export function setAddress(query: string) {
  address.params = new URLSearchParams(query)
  address.listeners.forEach(l => l())
}

export const data = {
  useFolder: vi.fn(),
  useArtefacts: vi.fn(),
  useKnowledge: vi.fn(),
  useFileContent: vi.fn(),
  useWorkspaces: vi.fn(),
  usePlacePreviews: vi.fn(() => new Map<string, string>()),
  previewAddress: (id: string) => `/open-preview/${id}`,
}

export const ok = <T,>(value: T) => ({ data: value, isLoading: false, error: null as Error | null })
export const failed = (error: Error) => ({ data: undefined, isLoading: false, error })
export const siteDown = Object.assign(new Error('Execution Site "Laptop" is unreachable — its runs and workspaces are unavailable until it reconnects'), { statusCode: 503 })

export const NOW_ISO = (days: number, hour = 9) => new Date(Date.now() - days * 86_400_000 + (hour - new Date().getHours()) * 3_600_000).toISOString()
export type { ListedEntry, KnowledgeTopic }
