// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WelcomeLine } from '../components/WelcomeLine'
import { rememberWelcome } from '../../auth/pages/parts/welcomeLine'

beforeEach(() => window.sessionStorage.clear())
afterEach(cleanup)

describe('The welcome line @SC-720', () => {
  it('welcomes a person who has just joined by their first name, once', () => {
    rememberWelcome('Dana Ruiz')
    const first = render(<WelcomeLine />)
    expect(screen.getByTestId('welcome-line').textContent).toContain('Welcome, Dana')
    first.unmount()
    render(<WelcomeLine />)
    expect(screen.queryByTestId('welcome-line')).toBeNull()
  })

  it('shows nothing to anyone else', () => {
    render(<WelcomeLine />)
    expect(screen.queryByTestId('welcome-line')).toBeNull()
  })
})
