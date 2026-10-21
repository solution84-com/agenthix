// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const ops = vi.hoisted(() => ({ data: null as any, dismiss: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: ops.data, refetch: ops.refetch }),
  getPledgeCard: 'getPledgeCard',
  dismissPledge: ops.dismiss,
}))

import { PledgeCard } from '../components/PledgeCard'

const PAGE = 'https://agenthix.com/responsible-ai'
const SIGN = 'https://cloud.example.com/pledge/sign'

beforeEach(() => {
  ops.data = { kind: 'invite', pageUrl: PAGE }
  ops.dismiss.mockReset().mockResolvedValue({ dismissed: true })
  ops.refetch.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('the Responsible AI Pledge card @SC-1122', () => {
  it('invites to the movement, saying why, and links to the pledge\'s page, carrying nothing', () => {
    render(<PledgeCard />)
    expect(screen.getByText('The Responsible AI Pledge — an Agenthix initiative')).toBeTruthy()
    expect(screen.getByText(/as good as the people who use it/)).toBeTruthy()
    expect(screen.getByText(/free to sign/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Join the movement/ }).getAttribute('href')).toBe(PAGE)
  })

  it('is dismissed for good with ×', () => {
    render(<PledgeCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Responsible AI Pledge/)).toBeNull()
    expect(ops.dismiss).toHaveBeenCalledWith(undefined)
  })

  it('draws nothing when the server says so', () => {
    ops.data = { kind: 'none' }
    render(<PledgeCard />)
    expect(screen.queryByText(/Responsible AI Pledge/)).toBeNull()
  })
})

describe('the pledge card for a linked Agenthix account @SC-1125', () => {
  it('not signed: joining goes straight to signing on Cloud, with what it asks beside it', () => {
    ops.data = { kind: 'inviteLinked', pageUrl: PAGE, signUrl: SIGN }
    render(<PledgeCard />)
    expect(screen.getByText(/already signed in to Agenthix Cloud/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Join the movement/ }).getAttribute('href')).toBe(SIGN)
    expect(screen.getByRole('link', { name: /What it asks/ }).getAttribute('href')).toBe(PAGE)
  })

  it('signed an earlier version: names both versions, and dismissing it is kept for that version', () => {
    ops.data = { kind: 'newVersion', signedVersion: 1, currentVersion: 2, signUrl: SIGN }
    render(<PledgeCard />)
    expect(screen.getByText('The Responsible AI Pledge has a new version')).toBeTruthy()
    expect(screen.getByText(/Thank you for signing version 1\. Version 2 is out/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /See what changed/ }).getAttribute('href')).toBe(SIGN)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(ops.dismiss).toHaveBeenCalledWith({ newVersion: 2 })
  })
})
