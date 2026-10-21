import { describe, expect, it } from 'vitest'
import { spokenText } from '../../../shared/conversations/shownParts'
import { heardText, speechUnits, stripMarkup } from '../speechUnits'

const said = (text: string, final = true) => speechUnits(text, final).map(u => u.text)

describe('speech units @SC-995 @SC-996', () => {
  it('does not say the mark of a reply that only asks the person to go on', () => {
    expect(said(':::encouragement\nMm? Go on.')).toEqual(['Mm?', 'Go on.'])
    expect(said(':::listen', false)).toEqual([])
  })

  it('cuts prose into sentences, each with where its words are in the written reply', () => {
    const text = 'Hello there. How are you? Fine!'
    const units = speechUnits(text, true)
    expect(units.map(u => u.text)).toEqual(['Hello there.', 'How are you?', 'Fine!'])
    for (const u of units) expect(text.slice(u.start, u.end)).toBe(u.text)
  })

  it('holds back a sentence still streaming, and returns the same units for a prefix as for the whole', () => {
    const whole = 'The build passed. Three tests were slow, and one failed. Want the details?'
    expect(said(whole.slice(0, 20), false)).toEqual(['The build passed.'])
    for (let n = 0; n <= whole.length; n++) {
      const prefix = speechUnits(whole.slice(0, n), false)
      expect(speechUnits(whole, true).slice(0, prefix.length)).toEqual(prefix)
    }
  })

  it('a sentence ending the stream is said only when the reply ends', () => {
    expect(said('All done.', false)).toEqual([])
    expect(said('All done.', true)).toEqual(['All done.'])
  })

  it('strips markup it cannot read and speaks the prose', () => {
    const text = '## Summary\n\n- **First**, the `build` step.\n- Then [the tests](https://x.test).\n\n1. One thing.'
    expect(said(text)).toEqual(['Summary', 'First, the build step.', 'Then the tests.', 'One thing.'])
  })

  it('skips a code block, a table and a rule', () => {
    const text = 'Here it is.\n```ts\nconst a = 1. b = 2.\n```\n| a | b |\n|---|---|\n| 1. | 2. |\n---\nThat is all.'
    expect(said(text)).toEqual(['Here it is.', 'That is all.'])
  })

  it('speaks a shown part as its line, in the place of its body, spanning the block', () => {
    const text = 'Sure.\n:::shown The three steps\n> I put a diagram of the three steps in the thread.\n| a | b |\n:::\nAnything else?'
    const units = speechUnits(text, true)
    expect(units.map(u => u.text)).toEqual(['Sure.', 'I put a diagram of the three steps in the thread.', 'Anything else?'])
    const part = units[1]!
    expect(text.slice(part.start, part.blockEnd)).toBe(':::shown The three steps\n> I put a diagram of the three steps in the thread.\n| a | b |\n:::')
  })

  it('a shown part without its own line says where it is, as the parser does', () => {
    expect(said(':::shown Table\n| a |\n:::')).toEqual(["I've put Table in the thread."])
  })

  it('a shown part is spoken once its line is complete, before its body has streamed', () => {
    expect(said('Ok.\n:::shown Chart\n> A chart is in the thread.\n| a', false)).toEqual(['Ok.', 'A chart is in the thread.'])
  })

  it('reads what spokenText reads', () => {
    const text = 'One. Two.\n\n:::shown Plan\n> The plan is in the thread.\nbody **here**.\n:::\n\nThree.'
    const fromUnits = said(text).join(' ')
    expect(fromUnits).toBe(stripMarkup(spokenText(text)).replace(/\s+/g, ' '))
  })

  it('a line not yet known to be prose waits for its end', () => {
    expect(said('Ok. \n| a. b', false)).toEqual(['Ok.'])
    expect(said('# Title. Mo', false)).toEqual([])
  })
})

describe('what was heard @SC-995', () => {
  const text = 'First point. Second point. Third point.'
  it('keeps the written reply through the last sentence heard to its end', () => {
    expect(heardText(text, 0)).toBe('First point.')
    expect(heardText(text, 1)).toBe('First point. Second point.')
    expect(heardText(text, 9)).toBe(text)
  })

  it('keeps nothing when nothing was heard to its end', () => {
    expect(heardText(text, -1)).toBe('')
  })

  it('keeps a shown part whole', () => {
    const shown = 'Look.\n:::shown T\n> It is in the thread.\nbody\n:::\nMore.'
    expect(heardText(shown, 1)).toBe('Look.\n:::shown T\n> It is in the thread.\nbody\n:::')
  })
})
