// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MarkdownMessage } from '../../MarkdownMessage'
import { ReplyBody } from '../../../../conversations/components/ReplyBody'
import type { RevealMarks } from '../rehypeReveal'

afterEach(cleanup)

/** The characters still being revealed, by their place in the reply's text. */
const revealing = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-c]')].map((n) => n.textContent).join('')
const places = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-c]')].map((n) => Number(n.dataset.c))
const marks = (from: number, opacity: (i: number) => number = () => 0): RevealMarks => ({ offset: 0, from, opacity })

describe('Markdown being revealed @SC-1914', () => {
  it('marks each character from where the reveal is, by its place in the source', () => {
    const { container } = render(<MarkdownMessage content={'Hello **there** you'} reveal={marks(10)} />)
    expect(revealing(container)).toBe('ereyou')
    expect(places(container)).toEqual([10, 11, 12, 16, 17, 18])
    expect(container.textContent).toBe('Hello there you')
  })

  it('draws each marked character as visible as the reveal says, so nothing flashes before the first frame', () => {
    const { container } = render(<MarkdownMessage content={'Hi you'} reveal={marks(0, (i) => (i < 2 ? 0.5 : 0))} />)
    const spans = [...container.querySelectorAll<HTMLElement>('[data-c]')]
    expect(spans.map((n) => n.style.opacity)).toEqual(['0.5', '0.5', '0', '0', '0'])
  })

  it('draws a code block whole, never cut into pieces', () => {
    const { container } = render(<MarkdownMessage content={'Run:\n\n```\nnpm test\n```'} reveal={marks(0)} />)
    expect(container.querySelector('pre')!.textContent).toBe('npm test')
    expect(revealing(container)).toBe('Run:')
  })

  it('keeps a table a table', () => {
    const { container } = render(<MarkdownMessage content={'| a | b |\n|---|---|\n| 1 | 2 |'} reveal={marks(0)} />)
    expect(container.querySelectorAll('td')).toHaveLength(2)
    expect(revealing(container)).toBe('ab12')
  })

  it('draws plainly with nothing being revealed', () => {
    const { container } = render(<MarkdownMessage content={'Hello'} />)
    expect(revealing(container)).toBe('')
  })
})

describe('a reply whose words arrive @SC-1914', () => {
  it('shows a reply loaded whole at once', () => {
    const { container } = render(<ReplyBody text={'A reply from history.'} replyKey="r1" writtenAt="2026-11-10T10:00:00Z" />)
    expect(revealing(container)).toBe('')
  })

  it('lays a streaming reply out from its first words, hidden until the position passes them', () => {
    const { container } = render(<ReplyBody text={'Hello there'} replyKey="r2" live />)
    expect(revealing(container)).toBe('Hellothere')
    expect([...container.querySelectorAll<HTMLElement>('[data-c]')].every((n) => n.style.opacity === '0')).toBe(true)
  })

  it('never reveals again what was already shown when a block re-parses', () => {
    const { container, rerender } = render(<ReplyBody text={'Hello'} replyKey="r3" writtenAt="2026-11-10T10:00:00Z" />)
    rerender(<ReplyBody text={'Hello *world*'} replyKey="r3" writtenAt="2026-11-10T10:00:00Z" />)
    expect(container.querySelector('em')!.textContent).toBe('world')
    expect(revealing(container)).toBe('world')
  })

  it('in voice, lays out only as far as the limit and reveals towards the target @SC-1913', () => {
    const text = 'One two three. Four five.'
    const { container } = render(<ReplyBody text={text} limit={14} target={4} replyKey="r4" writtenAt="2026-11-10T10:00:00Z" />)
    expect(container.textContent).toBe('One two three.')
    expect(revealing(container)).toBe('Onetwothree.')
  })

  it('shows a reply drawn with no time it was written at once, unless it is said to be live', () => {
    const { container } = render(<ReplyBody text={'Not streaming.'} replyKey="plain" />)
    expect(revealing(container)).toBe('')
  })
})

describe('the end of a stream @SC-1914', () => {
  it("the stored reply that takes the stream's place carries on from where the reveal was", () => {
    const stream = render(<ReplyBody text={'Hello there'} replyKey="t-end" live />)
    stream.unmount()
    const stored = render(<ReplyBody text={'Hello there'} replyKey="t-end" writtenAt="2026-11-10T10:00:00Z" />)
    // Still being revealed, not shown whole at once.
    expect(revealing(stored.container)).toBe('Hellothere')
  })

  it('takes nothing over from another reply', () => {
    render(<ReplyBody text={'Streamed words'} replyKey="t-other" live />).unmount()
    const other = render(<ReplyBody text={'Something else'} replyKey="t-other" writtenAt="2026-11-10T10:00:00Z" />)
    expect(revealing(other.container)).toBe('')
  })
})

describe("Markdown read in a conversation's place", () => {
  // A conversation's replies turn paths into links (remarkReferences), which rebuilds every text node: the pieces must
  // keep their place in the source, or nothing in a conversation is ever revealed.
  const ownerPlace = { place: { space: 'owner', owner: { kind: 'user', id: 'u1' } }, folder: '' } as unknown as Parameters<typeof MarkdownMessage>[0]['embed']

  it('marks the words being revealed, around a path made a link', () => {
    const content = 'See files/reports/q3.pdf for the rest of it'
    const { container } = render(<MarkdownMessage content={content} embed={ownerPlace} reveal={marks(25)} />)
    expect(revealing(container)).toBe('fortherestofit')
  })
})
