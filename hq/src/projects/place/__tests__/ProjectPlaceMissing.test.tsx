// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ q: {} as Record<string, unknown>, refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ refetch: h.refetch, dataUpdatedAt: 0, ...h.q }),
  getProjectPreview: 'getProjectPreview',
}))
vi.mock('react-router', () => ({ useParams: () => ({ key: 'WEB' }) }))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../ProjectPreviewPage', () => ({ ProjectPreviewPage: () => <p>preview</p> }))

import { ProjectPlaceMissing } from '../ProjectPlaceMissing'

afterEach(() => { cleanup(); h.refetch.mockReset() })

describe('a project screen with no project @SC-1937', () => {
  it('says the project could not be read, with Try again, when the read failed without an answer', () => {
    h.q = { data: undefined, error: new Error('network'), isLoading: false }
    render(<ProjectPlaceMissing loading={false} />)
    expect(screen.getByText('The project could not be read')).toBeTruthy()
    expect(screen.queryByText('Project not found')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.refetch).toHaveBeenCalled()
  })

  it('says not found for a final answer, without Try again', () => {
    h.q = { data: undefined, error: Object.assign(new Error('Project not found'), { statusCode: 404 }), isLoading: false }
    render(<ProjectPlaceMissing loading={false} />)
    expect(screen.getByText('Project not found')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
