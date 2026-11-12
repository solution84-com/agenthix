// @vitest-environment jsdom
/** The demo's prompt row (usability round 2, Minor 1): no chip is ever cut at the row's edge without a sign. */
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SCROLL_EDGE_FADE } from '@agenthix/ui/primitives'
import { SuggestedPrompts } from '../SuggestedPrompts'

afterEach(cleanup)

const prompts = ['What can you do?', 'How are the tasks going?', 'Start the case-study page', 'Review the quarterly summary']

describe('the prompt row under the message box @SC-1959', () => {
  for (const compact of [false, true]) {
    it(`${compact ? 'compact, once the conversation is under way' : 'before the first message'}: wraps on a wide screen, and on a phone scrolls with a fade at its edge`, () => {
      render(<SuggestedPrompts prompts={prompts} compact={compact} onPick={() => {}} />)
      const row = screen.getByTestId('suggested-prompts')
      const classes = row.className.split(/\s+/)
      expect(classes).toContain('sm:flex-wrap')
      expect(classes).toContain('max-sm:overflow-x-auto')
      // Scrolling only where the fade is: never a bare overflow at a width with no fade.
      expect(classes).not.toContain('overflow-x-auto')
      expect(row.className).toContain(SCROLL_EDGE_FADE)
      expect(screen.getAllByRole('button')).toHaveLength(4)
    })
  }
})
