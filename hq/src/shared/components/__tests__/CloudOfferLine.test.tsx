// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const ops = vi.hoisted(() => ({ offers: null as any, dismiss: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../../test/featuresAnswer')
  return {
    useQuery: (q: string) => q === 'getFeatures' ? { data: featuresAnswer() } : q === 'getOrgIdentity' ? { data: { name: 'Acme Robotics' } } : { data: ops.offers, refetch: ops.refetch },
    getMyCloudOffers: 'getMyCloudOffers',
    getOrgIdentity: 'getOrgIdentity',
    getFeatures: 'getFeatures',
    dismissCloudOffer: ops.dismiss,
  }
})
vi.mock('@agenthix/ui/primitives', () => ({ FOCUS_RING: '', hostingLabel: () => 'Agenthix Cloud' }))

import { CloudOffer } from '../CloudOfferLine'
import { withFeature } from '@agenthix/core/testing'

beforeEach(() => {
  ops.offers = { fleetAdmin: true, dismissed: [], cloudOrigin: 'https://cloud.test' }
  ops.dismiss.mockReset().mockResolvedValue({ dismissed: true })
  ops.refetch.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('the offer to run a site on Agenthix Cloud while its flag is off (adr-0189)', () => {
  it('shows a fleet admin nothing', () => {
    render(<CloudOffer offer="site" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).not.toContain('Cloud')
  })
})

withFeature('cloud', () => {
  describe('the offer to run a site on Agenthix Cloud @SC-1118', () => {
    it('shows a fleet admin one line with a link out for the task, and nothing about the organisation or person in the link', () => {
      render(<CloudOffer offer="site" />)
      expect(screen.getByText(/can run sites for Acme Robotics on its machines/)).toBeTruthy()
      const url = new URL(screen.getByRole('link', { name: /Run a site on Agenthix Cloud/ }).getAttribute('href')!)
      expect(url.searchParams.get('task')).toBe('offer-site')
      expect(url.toString()).not.toMatch(/Acme|acme/)
    })

    it('shows a member nothing', () => {
      ops.offers = { ...ops.offers, fleetAdmin: false }
      render(<CloudOffer offer="site" />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('shows nothing once that offer is dismissed, and dismissing hides it and tells hq', () => {
      render(<CloudOffer offer="site" />)
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('link')).toBeNull()
      expect(ops.dismiss).toHaveBeenCalledWith({ offer: 'site' })
      cleanup()
      ops.offers = { ...ops.offers, dismissed: ['site'] }
      render(<CloudOffer offer="site" />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('shows nothing when hq does not know where Cloud is', () => {
      ops.offers = { ...ops.offers, cloudOrigin: null }
      render(<CloudOffer offer="site" />)
      expect(screen.queryByRole('link')).toBeNull()
    })
  })
})
