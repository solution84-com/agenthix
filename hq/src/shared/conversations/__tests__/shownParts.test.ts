import { describe, expect, it } from 'vitest'
import { splitShownParts, spokenText, isEncouragement, withoutEncouragementLine } from '../shownParts'

describe('shown parts @SC-996', () => {
  it('splits prose and a part, with its title, spoken line and body', () => {
    const text = 'Here it is.\n:::shown The three steps\n> A diagram of the three steps; tap it to open.\n```mermaid\ngraph TD\n```\n:::\nThat is the slow one.'
    expect(splitShownParts(text)).toEqual([
      { kind: 'prose', text: 'Here it is.' },
      { kind: 'shown', part: { title: 'The three steps', spoken: 'A diagram of the three steps; tap it to open.', body: '```mermaid\ngraph TD\n```' } },
      { kind: 'prose', text: 'That is the slow one.' },
    ])
  })

  it('reads an unclosed part to the end, as a reply still streaming', () => {
    expect(splitShownParts(':::shown Table\n> A table.\n| a |')).toEqual([
      { kind: 'shown', part: { title: 'Table', spoken: 'A table.', body: '| a |' } },
    ])
  })

  it('gives a part with no spoken line one of its own', () => {
    expect(spokenText(':::shown The plan\n- one\n:::')).toBe("I've put The plan in the thread.")
  })

  it('speaks the line in the body\'s place and leaves prose as written', () => {
    expect(spokenText('First.\n:::shown Code\n> The code is in the thread.\nconst x = 1\n:::\nLast.')).toBe('First.\n\nThe code is in the thread.\n\nLast.')
  })

  it('leaves text with no part alone', () => {
    expect(splitShownParts('Just words.')).toEqual([{ kind: 'prose', text: 'Just words.' }])
  })

  it('hides the mark of a reply that only asks the person to go on, and knows it for one', () => {
    const text = ':::encouragement\nMm? Go on.'
    expect(isEncouragement(text)).toBe(true)
    expect(isEncouragement('Go on.\n:::encouragement')).toBe(false)
    expect(withoutEncouragementLine(text)).toBe('Mm? Go on.')
    expect(splitShownParts(text)).toEqual([{ kind: 'prose', text: 'Mm? Go on.' }])
  })
})
