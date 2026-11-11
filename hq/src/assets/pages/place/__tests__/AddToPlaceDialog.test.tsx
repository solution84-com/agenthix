// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ q: {} as Record<string, unknown>, refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ refetch: h.refetch, dataUpdatedAt: 0, ...h.q }),
  getLibraryAssets: 'getLibraryAssets', addSkillToPlace: vi.fn(),
}))

import { AddToPlaceDialog } from '../AddToPlaceDialog'
const draw = () => render(<AddToPlaceDialog projectId="p1" placeName="Website" agents={[]} onClose={vi.fn()} />)

afterEach(() => { cleanup(); h.refetch.mockReset() })

describe('Add to this place: the Library read @SC-1935', () => {
  it('says the Library could not be read, with Try again, and never "No installed skill matches"', () => {
    h.q = { data: undefined, error: new Error('network') }
    draw()
    expect(screen.getByText('The Library could not be read')).toBeTruthy()
    expect(screen.queryByText('No installed skill matches.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.refetch).toHaveBeenCalled()
  })

  it('says nothing matches only after a good read', () => {
    h.q = { data: { rows: [] }, error: null }
    draw()
    expect(screen.getByText('No installed skill matches.')).toBeTruthy()
  })
})
