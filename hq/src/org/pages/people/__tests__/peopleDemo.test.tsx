// @vitest-environment jsdom
/** A visitor's handle in the public demo (walkthrough finding 10): @visitor-NNNN, from their username. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ demo: false }))
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo', setPersonName: 'setPersonName', uploadPersonPicture: 'uploadPersonPicture',
  removePersonPicture: 'removePersonPicture',
  useQuery: (op: string) => ({ data: op === 'getDemoInfo' && h.demo ? { on: true, nextResetAt: '', agents: {} } : undefined }),
  useAction: () => vi.fn(),
}))

import { PersonNameAndPicture } from '../PersonNameAndPicture'
import { visitorNumber } from '../../../../demo/visitors'

afterEach(cleanup)

describe("a visitor's handle in Settings' profile @SC-1973", () => {
  const visitor = { userId: 'v1', name: 'Visitor 4691', handle: 'visitor-7801991832c994461474e94a', avatarUrl: null }
  it('shows @visitor-NNNN in the demo, and the real handle outside it', () => {
    h.demo = true
    render(<PersonNameAndPicture person={visitor} canEdit={false} />)
    expect(screen.getByText(`@visitor-${visitorNumber(visitor.handle)}`)).toBeTruthy()
    expect(screen.queryByText(/7801991832/)).toBeNull()
    cleanup()
    h.demo = false
    render(<PersonNameAndPicture person={visitor} canEdit={false} />)
    expect(screen.getByText('@visitor-7801991832c994461474e94a')).toBeTruthy()
  })
})
