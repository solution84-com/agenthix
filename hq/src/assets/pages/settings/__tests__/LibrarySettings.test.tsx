// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  update: vi.fn(async () => ({})), name: vi.fn(), remove: vi.fn(async () => ({})),
  data: {} as Record<string, unknown>,
}))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: h.data[op], error: undefined, refetch: vi.fn() }),
  useAction: (op: string) => (op === 'updateAssetSettings' ? h.update : op === 'nameLibraryMaintainer' ? h.name : h.remove),
  getAssetSettings: 'getAssetSettings', updateAssetSettings: 'updateAssetSettings',
  listLibraryMaintainers: 'listLibraryMaintainers', nameLibraryMaintainer: 'nameLibraryMaintainer', removeLibraryMaintainer: 'removeLibraryMaintainer',
  getOrgPeople: 'getOrgPeople',
}))

import { MaintainersSection } from '../MaintainersSection'
import { OutsideSettings } from '../OutsideSettings'

beforeEach(() => {
  h.update.mockClear(); h.name.mockReset(); h.remove.mockClear()
  h.data = {
    getAssetSettings: { unsignedAssets: 'allowed', outsideInstallers: 'ADMINS', fileSkillsDefault: 'OFF', personalSkillsOutsideSpace: true },
    listLibraryMaintainers: [{ userId: 'u1', namedById: null, since: '2026-10-01T00:00:00.000Z' }],
    getOrgPeople: { people: [
      { person: { userId: 'u1', name: 'Avery Chen', state: 'active' }, orgRole: 'MEMBER' },
      { person: { userId: 'u2', name: 'Lee Park', state: 'active' }, orgRole: 'MEMBER' },
      { person: { userId: 'u3', name: 'Sam Rivera', state: 'active' }, orgRole: 'ADMIN' },
    ] },
  }
})
afterEach(cleanup)

describe('skills found in files (board R2, C1) @SC-1616 @SC-1935', () => {
  it('asks before turning On by default on, and says why', async () => {
    render(<OutsideSettings />)
    fireEvent.click(screen.getByRole('radio', { name: /On by default/ }))
    expect(h.update).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toContain('without anyone reviewing them first')
    fireEvent.click(screen.getByRole('button', { name: 'Run them unreviewed' }))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ fileSkillsDefault: 'ON', confirmUnreviewed: true }))
  })

  it('changes a stricter choice at once, and marks Off by default as recommended', async () => {
    render(<OutsideSettings />)
    expect(screen.getByText('recommended')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Skills in files aren't read/ }))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ fileSkillsDefault: 'NEVER' }))
  })

  it('sets unsigned assets, who installs from outside, and personal skills', async () => {
    render(<OutsideSettings />)
    fireEvent.click(screen.getByRole('radio', { name: /Only signed assets install/ }))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ unsignedAssets: 'never' }))
    fireEvent.click(screen.getByRole('radio', { name: /Administrators and Library maintainers/ }))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ outsideInstallers: 'ADMINS_AND_MAINTAINERS' }))
    fireEvent.click(screen.getByRole('radio', { name: /They stay in Your space/ }))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ personalSkillsOutsideSpace: false }))
  })
})

describe('Library maintainers (board R2, D28) @SC-1617', () => {
  it('names the people who are, and offers members who are not and not administrators', () => {
    render(<MaintainersSection />)
    expect(screen.getByTestId('maintainers').textContent).toContain('Avery Chen')
    const options = screen.getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['Choose a member…', 'Lee Park'])
  })

  it('shows the reach and names nobody until it is confirmed', async () => {
    h.name.mockResolvedValueOnce({ named: false, reach: "Library maintainers publish skills that run for every agent, in every project, including ones they can't access." })
    h.name.mockResolvedValueOnce({ named: true })
    render(<MaintainersSection />)
    fireEvent.change(screen.getByLabelText('Person to name'), { target: { value: 'u2' } })
    fireEvent.click(screen.getByRole('button', { name: /Add a Library maintainer/ }))
    await screen.findByRole('dialog')
    expect(screen.getByText('Make Lee Park a Library maintainer?')).toBeTruthy()
    expect(h.name).toHaveBeenCalledTimes(1)
    expect(h.name).toHaveBeenLastCalledWith({ userId: 'u2' })
    fireEvent.click(screen.getByRole('button', { name: 'Make Library maintainer' }))
    await waitFor(() => expect(h.name).toHaveBeenLastCalledWith({ userId: 'u2', reachConfirmed: true }))
  })
})
