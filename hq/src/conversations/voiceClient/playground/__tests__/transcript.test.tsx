// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import { Transcript } from '../Transcript'

const agent = (over: Partial<PlaygroundEntry>): PlaygroundEntry => ({ id: 'a', role: 'agent', text: 'One. Two. Three.', turnId: 't', state: 'COMPLETED', at: 1, ...over })

describe('the conversation as the person heard it @SC-1840', () => {
  it('shows only the part of a spoken reply heard so far', () => {
    const { container } = render(<Transcript entries={[agent({})]} reveal={() => 4} />)
    expect(container.querySelector('[data-role="agent"]')!.textContent).toBe('One.Agent')
    expect(screen.queryByText(/Two/)).toBeNull()
  })

  it('reveals the words of a reply as they are heard, the same way the conversation does', () => {
    const { container, rerender } = render(<Transcript entries={[agent({})]} reveal={() => 4} />)
    rerender(<Transcript entries={[agent({})]} reveal={() => 9} />)
    expect(container.textContent).toContain('One. Two.')
    const revealing = [...container.querySelectorAll('[data-c]')].map((n) => n.textContent).join('')
    expect(revealing).toBe('One.Two.')
  })

  it('shows what the person said at once', () => {
    const { container } = render(<Transcript entries={[agent({ id: 'p', role: 'person', text: 'Hello.' })]} />)
    expect(container.querySelector('[data-c]')).toBeNull()
  })

  it('leaves out a reply that was withdrawn or stopped before a word was heard', () => {
    render(<Transcript entries={[agent({ id: 'w', text: '', withdrawn: true }), agent({ id: 'i', text: '', interrupted: true }), agent({ id: 'k', text: 'Heard it.' })]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Heard it.')).toBeTruthy()
  })
})
