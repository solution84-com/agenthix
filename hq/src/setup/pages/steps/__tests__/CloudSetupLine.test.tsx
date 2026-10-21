// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const ops = vi.hoisted(() => ({ data: undefined as any }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: ops.data }), getWhereHqRuns: 'getWhereHqRuns' }))

import { CloudSetupLine } from '../CloudSetupLine'

afterEach(cleanup)

describe('Setup › Review mentions Agenthix Cloud once @SC-1121', () => {
  it('in one sentence with no link or button', () => {
    ops.data = { hosting: 'self', connectedAs: null }
    render(<CloudSetupLine />)
    expect(screen.getByText('Agenthix Cloud can also run sites for you on its machines; a fleet admin can connect it later, in the Fleet Console.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('not on an HQ that Agenthix Cloud runs, and not before it is known', () => {
    ops.data = { hosting: 'cloud', connectedAs: 'Acme Robotics' }
    const { container } = render(<CloudSetupLine />)
    expect(container.textContent).toBe('')
    cleanup()
    ops.data = undefined
    expect(render(<CloudSetupLine />).container.textContent).toBe('')
  })
})
