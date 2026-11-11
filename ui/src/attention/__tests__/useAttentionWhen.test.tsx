// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useAttentionWhen } from '../useAttentionWhen'
import { UnansweredSitesNotice } from '../../primitives/UnansweredSitesNotice'

afterEach(cleanup)

function Failing({ text, retry }: { text: string | null; retry?: () => void }) {
  const dialog = useAttentionWhen(text, { title: 'Could not save', retry })
  return <div data-testid="content">{dialog}</div>
}

describe('useAttentionWhen @SC-1906', () => {
  it('draws nothing in the content and opens the dialog when words appear', () => {
    const { rerender } = render(<Failing text={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Failing text="The site did not answer. Nothing was changed." />)
    expect(screen.getByRole('alert').textContent).toBe('The site did not answer. Nothing was changed.')
    expect(screen.getByText('Could not save')).toBeTruthy()
  })

  it('closes with Close and does not open again for the same words', () => {
    const { rerender } = render(<Failing text="No." />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Failing text="No." />)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Failing text="Not that either." />)
    expect(screen.getByRole('alert').textContent).toBe('Not that either.')
  })

  it('offers Try again when there is a way', () => {
    let tried = 0
    render(<Failing text="No." retry={() => { tried += 1 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(tried).toBe(1)
  })
})

describe('UnansweredSitesNotice @SC-1906', () => {
  const copy = { headline: '2 sites did not answer', sites: [{ siteId: 'a', heading: 'office', detail: 'not reachable' }, { siteId: 'b', heading: 'lab', detail: 'timed out' }] }

  it('says it in the dialog, with a line per site', () => {
    render(<UnansweredSitesNotice copy={copy} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('2 sites did not answer')).toBeTruthy()
    expect(screen.getByText('office')).toBeTruthy()
    expect(screen.getByText(/timed out/)).toBeTruthy()
  })

  it('says nothing when every site answered', () => {
    render(<UnansweredSitesNotice copy={null} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
