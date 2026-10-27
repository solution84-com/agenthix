import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { MB, ready, relayServing } from './testKit'

afterEach(() => vi.unstubAllGlobals())

describe('the text renderer, end to end through the frame @SC-1583', () => {
  it('draws plain text, wrapped, never as HTML, with its line count @SC-1568', async () => {
    relayServing(new TextEncoder().encode('<b>bold?</b>\nsecond line\n'))
    render(<FileFrame answer={ready({ size: 25 })} name="notes.txt" onReopen={() => {}} />)
    const text = await screen.findByText(/<b>bold\?<\/b>/)
    expect(text.tagName).toBe('PRE')
    expect(text.className).toContain('whitespace-pre-wrap')
    expect(text.className).toContain('break-words')
    expect(text.querySelector('b')).toBeNull()
    expect(await screen.findByText('Text · 25 B · 2 lines')).toBeTruthy()
  })

  it('counts one line for a file with no newline, and none for an empty file', async () => {
    relayServing(new TextEncoder().encode('one'))
    const first = render(<FileFrame answer={ready({ size: 3 })} name="a.txt" onReopen={() => {}} />)
    expect(await screen.findByText('Text · 3 B · 1 line')).toBeTruthy()
    first.unmount()
    relayServing(new Uint8Array(0))
    render(<FileFrame answer={ready({ size: 0 })} name="b.txt" onReopen={() => {}} />)
    expect(await screen.findByText('Text · 0 B · 0 lines')).toBeTruthy()
  })

  it('reads at most 1 MB and shows the first 1 MB of a larger file, under the line @SC-1571', async () => {
    const body = new Uint8Array(Math.round(3.4 * MB)).fill(97)
    const fetch = relayServing(body)
    render(<FileFrame answer={ready({ size: body.length })} name="run.log" onReopen={() => {}} />)
    expect(await screen.findByText('Showing the first 1 MB of 3.4 MB.')).toBeTruthy()
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Range')).toBe(`bytes=0-${MB - 1}`)
  })

  it('does not call a multi-byte character cut at the cap bytes that are not text', async () => {
    const body = new Uint8Array(2 * MB).fill(97)
    body.set([0xc3, 0xa9], MB - 1)
    relayServing(body)
    render(<FileFrame answer={ready({ size: body.length })} name="run.log" onReopen={() => {}} />)
    expect(await screen.findByText(/Showing the first 1 MB/)).toBeTruthy()
  })

  it('says bytes that are not text in words', async () => {
    relayServing(new Uint8Array([0xff, 0xfe, 0x00, 0xc3]))
    render(<FileFrame answer={ready({ size: 4 })} name="notes.txt" onReopen={() => {}} />)
    expect(await screen.findByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
  })

  it('turns a 409 into the changed state', async () => {
    relayServing(new Uint8Array(0), 409)
    render(<FileFrame answer={ready()} name="notes.txt" onReopen={() => {}} />)
    expect(await screen.findByText('This file changed since you opened it.')).toBeTruthy()
  })

  it('turns an unavailable relay into the relay state', async () => {
    relayServing(new Uint8Array(0), 503)
    render(<FileFrame answer={ready()} name="notes.txt" onReopen={() => {}} />)
    expect(await screen.findByText(/can't be read right now/)).toBeTruthy()
  })
})
