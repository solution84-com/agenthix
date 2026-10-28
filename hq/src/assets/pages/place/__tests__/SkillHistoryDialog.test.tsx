// @vitest-environment jsdom
/** A place skill's roll back asks why, as the Library's does (V3; walkthrough finding 17), and sends what was written. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const rollBack = vi.fn()
vi.mock('wasp/client/operations', () => ({
  getPlaceSkillVersions: {},
  rollBackPlaceSkillVersion: (args: unknown) => rollBack(args),
  useQuery: () => ({
    data: {
      path: '.agents/skills/notes',
      versions: [
        { id: 'v2', number: 2, note: 'Second', at: '2026-10-27T10:00:00Z', inFiles: true, requestedByAgentId: null },
        { id: 'v1', number: 1, note: 'First', at: '2026-10-26T10:00:00Z', inFiles: false, requestedByAgentId: null },
      ],
    },
  }),
}))

import { SkillHistoryDialog } from '../SkillHistoryDialog'

afterEach(() => { cleanup(); rollBack.mockReset() })

describe('rolling a place skill back', () => {
  it('asks why before going back, and records the reason written', async () => {
    rollBack.mockResolvedValue({ number: 3 })
    const onClose = vi.fn()
    render(<SkillHistoryDialog placeSkillId="s1" name="notes" mayRollBack onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Roll back to 1' }))
    expect(rollBack).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Why/), { target: { value: 'Version 2 broke the summary' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go back to version 1' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(rollBack).toHaveBeenCalledWith({ placeSkillId: 's1', versionId: 'v1', reason: 'Version 2 broke the summary' })
  })

  it('records no made-up reason when none is written, and can be cancelled', async () => {
    rollBack.mockResolvedValue({ number: 3 })
    render(<SkillHistoryDialog placeSkillId="s1" name="notes" mayRollBack onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Roll back to 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Go back to version 1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Roll back to 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go back to version 1' }))
    await waitFor(() => expect(rollBack).toHaveBeenCalledWith({ placeSkillId: 's1', versionId: 'v1' }))
  })
})
