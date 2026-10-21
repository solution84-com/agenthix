// @vitest-environment jsdom
/** The Marketplace tab (every screen reviewed spec §3): Coming soon, with the website's links in a new tab and an example for each kind. */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MarketplaceTab } from '../MarketplaceTab'

afterEach(cleanup)

describe('the Marketplace tab @SC-678', () => {
  it('says Coming soon and gives the two links, each opening in a new tab', () => {
    render(<MarketplaceTab />)
    expect(screen.getByText('Coming soon')).toBeTruthy()
    const notify = screen.getByRole('link', { name: 'Get notified on agenthix.com ↗' })
    const about = screen.getByRole('link', { name: 'About Agenthix Cloud ↗' })
    expect(notify.getAttribute('href')).toBe('https://agenthix.com/marketplace')
    expect(about.getAttribute('href')).toBe('https://agenthix.com')
    for (const link of [notify, about]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })

  it('gives one example card for each kind, saying what the kind is and then "For example"', () => {
    render(<MarketplaceTab />)
    for (const kind of ['Agents', 'Team templates', 'Boards', 'Skills']) expect(screen.getByText(kind)).toBeTruthy()
    expect(screen.getAllByText('For example:')).toHaveLength(4)
  })
})
