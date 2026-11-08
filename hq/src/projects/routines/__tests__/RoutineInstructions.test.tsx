// @vitest-environment jsdom
/** A routine's instructions on its page (the Routines design keys 3, 8): the one Markdown editor, on Preview until clicked into. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/primitives')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Bold: icon, Code: icon, Heading2: icon, Italic: icon, Link: icon, List: icon, ListChecks: icon, ListOrdered: icon }
})
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <p>{content}</p> }))

import { RoutineInstructions } from '../RoutineInstructions'

afterEach(cleanup)

describe('a routine’s instructions', () => {
  it('read in the Markdown editor on Preview, with its Write and Preview tabs, and no separate Edit link', () => {
    render(<RoutineInstructions value="Check every footer link" onSave={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Write' })).toBeTruthy()
    expect(screen.getByText('Check every footer link')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull()
  })

  it('open Write on a click into them, and save a change', async () => {
    const onSave = vi.fn(() => Promise.resolve(true))
    render(<RoutineInstructions value="Check every footer link" onSave={onSave} />)
    fireEvent.click(screen.getByText('Check every footer link'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), { target: { value: 'Check every link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Check every link'))
  })
})
