// @vitest-environment jsdom
/**
 * After sign-in Wasp lands on `/`; a page that sent the person to sign in is
 * returned to instead (the preview's access check, adr-0071).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const auth = vi.hoisted(() => ({ user: null as null | { id: string }, status: undefined as undefined | string }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: auth.user, status: auth.status }) }))

import { useReturnAfterSignIn } from '../useReturnAfterSignIn'
import { rememberReturnPath, takeReturnPath } from '../../returnAfterSignIn'

function Shell() {
  useReturnAfterSignIn()
  const { pathname } = useLocation()
  return <span data-testid="at">{pathname}</span>
}

function at(start: string) {
  render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="*" element={<Shell />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('at').textContent
}

beforeEach(() => {
  window.sessionStorage.clear()
  auth.user = null
  auth.status = undefined
})

describe('useReturnAfterSignIn @SC-714', () => {
  it('goes back to the access check once signed in and off the sign-in page', () => {
    rememberReturnPath('/open-preview/abc', window.sessionStorage)
    auth.user = { id: 'u1' }
    expect(at('/')).toBe('/open-preview/abc')
  })

  it('waits while still on the sign-in page', () => {
    rememberReturnPath('/open-preview/abc', window.sessionStorage)
    auth.user = { id: 'u1' }
    expect(at('/login')).toBe('/login')
  })

  it('does nothing for someone not signed in', () => {
    rememberReturnPath('/open-preview/abc', window.sessionStorage)
    expect(at('/')).toBe('/')
  })

  it('ignores an external target, staying where Wasp put them', () => {
    window.sessionStorage.setItem('agenthix:return-after-sign-in', JSON.stringify({ path: '//evil.test/x', at: Date.now() }))
    auth.user = { id: 'u1' }
    expect(at('/')).toBe('/')
  })

  it('stays put with nothing remembered', () => {
    auth.user = { id: 'u1' }
    expect(at('/agents')).toBe('/agents')
  })

  it('remembers the page someone not signed in opened, for after they sign in (getting-in spec)', () => {
    auth.status = 'success'
    at('/projects/WEB/tasks?task=WEB-4')
    expect(takeReturnPath(window.sessionStorage)).toBe('/projects/WEB/tasks?task=WEB-4')
  })

  it('never remembers Home or a way in', () => {
    auth.status = 'success'
    for (const path of ['/', '/login', '/invite/abc', '/reset-password']) {
      at(path)
      cleanup()
    }
    expect(takeReturnPath(window.sessionStorage)).toBeNull()
  })

  it('remembers nothing while it is not yet known whether they are signed in', () => {
    auth.status = 'loading'
    at('/projects/WEB')
    expect(takeReturnPath(window.sessionStorage)).toBeNull()
  })
})
