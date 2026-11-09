// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import { Transcript } from '../Transcript'

const agent = (over: Partial<PlaygroundEntry>): PlaygroundEntry => ({ id: 'a', role: 'agent', text: 'One. Two. Three.', turnId: 't', state: 'COMPLETED', at: 1, ...over })

describe('the conversation as the person heard it @SC-1840', () => {
  it('shows only the part of a spoken reply heard so far', () => {
    render(<Transcript entries={[agent({})]} reveal={() => 4} />)
    expect(screen.getByText('One.')).toBeTruthy()
    expect(screen.queryByText(/Two/)).toBeNull()
  })

  it('leaves out a reply that was withdrawn or stopped before a word was heard', () => {
    render(<Transcript entries={[agent({ id: 'w', text: '', withdrawn: true }), agent({ id: 'i', text: '', interrupted: true }), agent({ id: 'k', text: 'Heard it.' })]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Heard it.')).toBeTruthy()
  })
})
