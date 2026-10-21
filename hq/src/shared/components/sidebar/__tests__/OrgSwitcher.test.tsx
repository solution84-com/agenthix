// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ cloud: { connected: false, linked: false, asked: false, cloudOrigin: 'https://cloud.test' } as any }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({ data: q === 'getOrgIdentity' ? { id: 'o1', name: 'Acme Robotics', avatarUrl: null } : ops.cloud }),
  getOrgIdentity: 'getOrgIdentity',
  getMyCloudSignIn: 'getMyCloudSignIn',
}))
vi.mock('../../AuthedImg', () => ({ AuthedImg: () => null }))

import { OrgSwitcher } from '../OrgSwitcher'

beforeEach(() => { ops.cloud = { connected: false, linked: false, asked: false, cloudOrigin: 'https://cloud.test' } })
afterEach(cleanup)

function open(path = '/projects') {
  render(<MemoryRouter initialEntries={[path]}><OrgSwitcher collapsed={false} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Acme Robotics, organisations' }))
}

describe('the organisation switcher @SC-1114', () => {
  it('lists only this organisation, and not connected says other organisations need Agenthix Cloud and where to ask', () => {
    open()
    const menu = screen.getByRole('menu', { name: 'Organisations' })
    expect(menu.textContent).toContain('Other organisations need Agenthix Cloud')
    expect(screen.getByRole('link', { name: /Ask for it in Settings › Sign-in/ }).getAttribute('href')).toBe('/settings')
    expect(screen.queryByText(/Switch organisation/)).toBeNull()
  })

  it('connected but not linked points to linking in Settings', () => {
    ops.cloud = { ...ops.cloud, connected: true }
    open()
    expect(screen.getByRole('link', { name: /Link it in Settings › Sign-in/ })).toBeTruthy()
    expect(screen.queryByText(/Switch organisation/)).toBeNull()
  })

  it('connected and linked opens the switcher on Cloud, carrying only the entry point and the page to return to', () => {
    ops.cloud = { ...ops.cloud, connected: true, linked: true }
    open('/projects')
    const url = new URL(screen.getByRole('menuitem', { name: /Switch organisation/ }).getAttribute('href')!)
    expect(url.origin).toBe('https://cloud.test')
    expect([...url.searchParams.keys()].sort()).toEqual(['from', 'return'])
    expect(url.searchParams.get('return')).toBe('/projects')
  })

  it('always holds Start your own organisation, and drops it only when hq does not know where Cloud is', () => {
    open()
    expect(screen.getByRole('menuitem', { name: /Start your own organisation/ }).getAttribute('href')).toContain('https://cloud.test/')
    cleanup()
    ops.cloud = { ...ops.cloud, cloudOrigin: null }
    open()
    expect(screen.queryByRole('menuitem', { name: /Start your own organisation/ })).toBeNull()
  })
})
