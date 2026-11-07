/** The tap sizes, focus ring and edge fades the last design check left for the close. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CopyIconButton, ReplyActions } from '../../sessions/ReplyActions'
import { FOCUS_RING, SCROLL_EDGE_FADE } from '../../primitives/controlStyles'
import { OverflowMenu } from '../OverflowMenu'
import { TasksScorecards } from '../TasksScorecards'
import { MarkdownBox } from '../MarkdownBox'
import { NO_COUNTS, scorecardsOf } from '../taskListWords'
import { runLineWords } from '../taskRunLines'

afterEach(cleanup)

describe('the close pass of the task screens', () => {
  it("draws a reply's Copy, Usage and Details 44 px square below lg", () => {
    render(<ReplyActions text="Done." usage={{ totalTokens: 10 } as never} runId="r1" onOpenRun={() => {}} />)
    for (const name of ['Copy', 'Usage', 'Details']) {
      const b = screen.getByRole('button', { name })
      expect(b.classList.contains('max-lg:h-11')).toBe(true)
      expect(b.classList.contains('max-lg:w-11')).toBe(true)
    }
    cleanup()
    render(<CopyIconButton text="x" />)
    expect(screen.getByRole('button', { name: 'Copy' }).classList.contains('max-lg:h-11')).toBe(true)
  })

  it("rings the task's ⋯ as Button does: a gap, then the accent ring", () => {
    render(<OverflowMenu items={[{ label: 'Copy link', onSelect: () => {} }]} />)
    const more = screen.getAllByRole('button')[0]
    expect(more.className).toContain(FOCUS_RING)
    expect(more.className).not.toMatch(/focus-visible:ring-2/)
  })

  it('fades the right edge of the rows that scroll sideways on a phone: the scorecards and the Markdown toolbar', () => {
    render(<TasksScorecards cards={scorecardsOf(NO_COUNTS, 'project')} chosen={null} onChoose={() => {}} />)
    expect(screen.getByRole('group', { name: 'Tasks by state' }).className).toContain(SCROLL_EDGE_FADE)
    cleanup()
    render(<MarkdownBox value="" onChange={() => {}} renderPreview={t => t} label="Comment" />)
    expect(screen.getByRole('toolbar', { name: 'Formatting' }).className).toContain(SCROLL_EDGE_FADE)
  })

  it("says who can okay a waiting run, when the reader can't", () => {
    const run = { id: 'r', number: 1, status: 'RUNNING', createdAt: new Date(2026, 10, 6, 9, 0), endedAt: null, startedBy: null } as never
    const now = new Date(2026, 10, 6, 9, 5)
    expect(runLineWords(run, { now, waiting: true, waitingLine: 'Waiting for a Member' }).what).toBe('Waiting for a Member')
    expect(runLineWords(run, { now, waiting: true }).what).toBe('Waiting for your okay')
  })
})
