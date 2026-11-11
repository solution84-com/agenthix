// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UnansweredSitesNotice } from '../UnansweredSitesNotice'

afterEach(cleanup)

const copy = { headline: '2 sites did not answer', sites: [{ siteId: 'a', heading: 'office', detail: 'not reachable' }, { siteId: 'b', heading: 'lab', detail: 'timed out' }] }

describe('UnansweredSitesNotice @SC-1906 @SC-1931', () => {
  it('is a nudge in the meta line, never a dialog, and Which lists the sites', () => {
    render(<UnansweredSitesNotice copy={copy} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/2 sites did not answer/)
    expect(screen.queryByText('office')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Which' }))
    expect(screen.getByText('office')).toBeTruthy()
    expect(screen.getByText(/timed out/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('office')).toBeNull()
  })

  it('with no site named, says the headline alone, without Which', () => {
    render(<UnansweredSitesNotice copy={{ headline: 'No Execution Site is connected.', sites: [] }} />)
    expect(screen.getByRole('status').textContent).toMatch(/No Execution Site is connected/)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('in place of the content, the headline is its first line', () => {
    render(<UnansweredSitesNotice copy={copy} place="content" />)
    expect(screen.getByRole('status').textContent).toMatch(/2 sites did not answer/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('in a row, it stays inline', () => {
    render(<UnansweredSitesNotice copy={copy} place="row" />)
    expect(screen.getByRole('status').tagName).toBe('SPAN')
  })

  it('says nothing when every site answered', () => {
    const { container } = render(<UnansweredSitesNotice copy={null} />)
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
