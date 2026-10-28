// @vitest-environment jsdom
/** Publishing a place skill from its files asks for the note the history needs, and sends it. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: { fingerprint: 'sha256:abc', current: true, files: [{ path: 'SKILL.md', base64: btoa('# Stand-up') }] }, error: undefined, isLoading: false }),
  getPlaceSkillFiles: 'getPlaceSkillFiles',
}))

import { SkillFilesDialog } from '../SkillFilesDialog'

afterEach(cleanup)

describe('publishing from files @SC-1644', () => {
  it('asks for a note, and sends it with the fingerprint shown', async () => {
    const confirm = vi.fn(async () => ({}))
    const onClose = vi.fn()
    render(<SkillFilesDialog placeSkillId="s1" name="standup-summary" mode={{ kind: 'publish', version: 1, confirm }} onClose={onClose} />)
    const publish = screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Note: what changed/), { target: { value: '  First version  ' } })
    expect(publish.disabled).toBe(false)
    fireEvent.click(publish)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(confirm).toHaveBeenCalledWith('sha256:abc', 'First version')
  })

  it('asks for no note to switch on', () => {
    render(<SkillFilesDialog placeSkillId="s1" name="standup-summary" mode={{ kind: 'switchOn', confirm: vi.fn() }} onClose={() => {}} />)
    expect(screen.queryByLabelText(/Note: what changed/)).toBeNull()
    expect((screen.getByRole('button', { name: 'Switch on' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
