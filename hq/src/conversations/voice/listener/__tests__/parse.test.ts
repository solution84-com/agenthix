/**
 * The light model's answer, read into one decision (adaptive voice listening, spec §The five tools and §Keeping it from
 * answering): exactly one tool, no text beside it, the turn ended only in a *sounds finished* call, every line under
 * its cap or dropped whole, and a `next_check` it still sends ignored. Anything that breaks a rule is `keep_listening`.
 */
import { describe, expect, it } from 'vitest'
import { LISTENER_SETTINGS } from '../settings'
import { countWords, parseListenerResponse, type ListenerResponse } from '../parse'

const call = (name: string, input: unknown = {}) => ({ name, input })
const tools = (calls: ListenerResponse['calls'], text = ''): ListenerResponse => ({ text, calls })
const json = (value: unknown): ListenerResponse => ({ text: JSON.stringify(value), calls: [] })

const dropped = (reason: string, tool?: string) => ({ tool: 'keep_listening', dropped: { reason, ...(tool ? { tool } : {}) } })

const mid = { mode: 'tools' as const, soundsFinished: false }
const fin = { mode: 'tools' as const, soundsFinished: true }

describe('one tool call is one decision', () => {
  it('reads keep_listening', () => {
    expect(parseListenerResponse(tools([call('keep_listening', { next_check: 5 })]), mid))
      .toEqual({ tool: 'keep_listening' })
  })

  it('reads acknowledge and invite with their words', () => {
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right, I see.', next_check: 3 })]), mid))
      .toEqual({ tool: 'acknowledge', say: 'Right, I see.' })
    expect(parseListenerResponse(tools([call('invite', { say: 'Take your time.', next_check: 10 })]), mid))
      .toEqual({ tool: 'invite', say: 'Take your time.' })
  })

  it('reads close_turn in a sounds finished call', () => {
    expect(parseListenerResponse(tools([call('close_turn', { say: "You're welcome.", next_check: 2 })]), fin))
      .toEqual({ tool: 'close_turn', say: "You're welcome." })
  })

  it('reads hand_over with asked, answer and hold, in a sounds finished call @SC-2204', () => {
    const input = { asked: 'the weather in Melbourne', answer: 'Sunny, 24 degrees.', hold: 'Good question, let me check the weather in Melbourne.', next_check: 4 }
    expect(parseListenerResponse(tools([call('hand_over', input)]), fin)).toEqual({
      tool: 'hand_over', asked: 'the weather in Melbourne', answer: 'Sunny, 24 degrees.',
      hold: 'Good question, let me check the weather in Melbourne.',
    })
  })

  it('reads hand_over without answer as answer null (the arm without it)', () => {
    expect(parseListenerResponse(tools([call('hand_over', { asked: 'x', hold: 'One moment.' })]), fin))
      .toMatchObject({ tool: 'hand_over', answer: null, hold: 'One moment.' })
  })

  it('takes arguments sent as a JSON string, as some providers do', () => {
    expect(parseListenerResponse(tools([call('acknowledge', '{"say":"Right.","next_check":2}')]), mid))
      .toEqual({ tool: 'acknowledge', say: 'Right.' })
  })

  it('trims the words it reads', () => {
    expect(parseListenerResponse(tools([call('acknowledge', { say: '  Right. ' })]), mid)).toMatchObject({ say: 'Right.' })
  })
})

describe('a call that breaks a rule is keep_listening @SC-2200', () => {
  it('no tool at all', () => {
    expect(parseListenerResponse(tools([]), mid)).toEqual(dropped('no tool'))
  })

  it('two tools', () => {
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right.' }), call('keep_listening')]), mid))
      .toEqual(dropped('two tools', 'acknowledge'))
  })

  it('text beside a tool, but not whitespace', () => {
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right.' })], 'Sure, it is sunny.'), mid))
      .toEqual(dropped('text beside a tool', 'acknowledge'))
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right.' })], ' \n '), mid)).toMatchObject({ tool: 'acknowledge' })
  })

  it('a tool that does not exist', () => {
    expect(parseListenerResponse(tools([call('answer_question', { say: 'Yes.' })]), mid))
      .toEqual(dropped('unknown tool', 'answer_question'))
  })

  it('close_turn or hand_over outside a sounds finished call', () => {
    expect(parseListenerResponse(tools([call('close_turn', { say: 'Bye.' })]), mid))
      .toEqual(dropped('ends the turn outside a sounds finished call', 'close_turn'))
    expect(parseListenerResponse(tools([call('hand_over', { asked: 'x', hold: 'One moment.' })]), mid))
      .toEqual(dropped('ends the turn outside a sounds finished call', 'hand_over'))
  })

  it('words over the cap are dropped whole, never cut', () => {
    const { caps } = LISTENER_SETTINGS
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right, I see what you mean there.' })]), mid))
      .toEqual(dropped('over the word cap', 'acknowledge'))
    expect(parseListenerResponse(tools([call('invite', { say: 'Take all the time you need, I am here.' })]), mid))
      .toEqual(dropped('over the word cap', 'invite'))
    expect(parseListenerResponse(tools([call('close_turn', { say: 'No problem at all, talk to you later then.' })]), fin))
      .toEqual(dropped('over the word cap', 'close_turn'))
    const hold = 'Ooh, good question, let me go and check the weather in Melbourne for you now.'
    expect(countWords(hold)).toBeGreaterThan(caps.hold)
    expect(parseListenerResponse(tools([call('hand_over', { asked: 'weather', hold })]), fin)).toEqual(dropped('over the word cap', 'hand_over'))
  })

  it('exactly at the cap is kept', () => {
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right, okay, I see that now.' })]), mid)).toMatchObject({ tool: 'acknowledge', say: 'Right, okay, I see that now.' })
  })

  it('a spoken tool with no words, or only punctuation', () => {
    expect(parseListenerResponse(tools([call('acknowledge', {})]), mid)).toEqual(dropped('no words', 'acknowledge'))
    expect(parseListenerResponse(tools([call('acknowledge', { say: '...' })]), mid)).toEqual(dropped('no words', 'acknowledge'))
    expect(parseListenerResponse(tools([call('hand_over', { asked: 'x', hold: '' })]), fin)).toEqual(dropped('no words', 'hand_over'))
  })

  it('arguments that are not an object', () => {
    expect(parseListenerResponse(tools([call('acknowledge', 'not json')]), mid)).toEqual(dropped('no words', 'acknowledge'))
  })

  it('caps can be changed in the settings', () => {
    const settings = { ...LISTENER_SETTINGS, caps: { ...LISTENER_SETTINGS.caps, acknowledge: 1 } }
    expect(parseListenerResponse(tools([call('acknowledge', { say: 'Right, yes.' })]), { ...mid, settings }))
      .toMatchObject({ tool: 'keep_listening', dropped: { reason: 'over the word cap' } })
  })
})

describe('hum, which the light model no longer has (the backchannel hums, by rule)', () => {
  it('is read as keep_listening, in either format, and no tool offers it', async () => {
    expect(parseListenerResponse(tools([call('hum', { say: 'Mm-hm.' })]), mid)).toEqual(dropped('unknown tool', 'hum'))
    expect(parseListenerResponse(json({ action: 'hum', say: 'Mm.' }), { mode: 'json', soundsFinished: true })).toEqual(dropped('unknown tool', 'hum'))
    const { LISTENER_TOOLS } = await import('../tools')
    expect(LISTENER_TOOLS).toEqual(['keep_listening', 'acknowledge', 'invite', 'close_turn', 'hand_over'])
  })
})

describe('next_check, which hq now decides', () => {
  it('is ignored when the light model still sends one: never an error, never in the decision', () => {
    expect(parseListenerResponse(tools([call('keep_listening', { next_check: 5 })]), mid)).toEqual({ tool: 'keep_listening' })
    expect(parseListenerResponse(json({ action: 'invite', say: 'Take your time.', next_check: 'soon' }), { mode: 'json', soundsFinished: false }))
      .toEqual({ tool: 'invite', say: 'Take your time.' })
    expect(parseListenerResponse(tools([call('close_turn', { say: 'Bye.', next_check: 9 })]), mid))
      .toEqual({ tool: 'keep_listening', dropped: { reason: 'ends the turn outside a sounds finished call', tool: 'close_turn' } })
  })

  it('is no longer asked for: the tools carry no next_check', async () => {
    const { listenerToolInputs } = await import('../tools')
    for (const input of Object.values(listenerToolInputs(LISTENER_SETTINGS.caps, { withAnswer: true }))) {
      expect(Object.keys(input.shape)).not.toContain('next_check')
    }
  })
})

describe('the JSON variant', () => {
  const j = { mode: 'json' as const, soundsFinished: true }

  it('reads one object with an action field', () => {
    expect(parseListenerResponse(json({ action: 'acknowledge', say: 'I see.', next_check: 3 }), j))
      .toEqual({ tool: 'acknowledge', say: 'I see.' })
    expect(parseListenerResponse(json({ action: 'hand_over', asked: 'x', answer: 'y', hold: 'Let me check that.' }), j))
      .toEqual({ tool: 'hand_over', asked: 'x', answer: 'y', hold: 'Let me check that.' })
  })

  it('also reads the spec\'s spelling, `tool` and `words`', () => {
    expect(parseListenerResponse(json({ tool: 'acknowledge', words: 'Right.', next_check: 2 }), { ...j, soundsFinished: false }))
      .toEqual({ tool: 'acknowledge', say: 'Right.' })
    expect(parseListenerResponse(json({ tool: 'hand_over', asked: 'x', words: 'Let me check that.' }), j))
      .toMatchObject({ tool: 'hand_over', hold: 'Let me check that.' })
  })

  it('accepts the object inside a code fence', () => {
    expect(parseListenerResponse({ text: '```json\n{"action":"keep_listening","next_check":4}\n```', calls: [] }, j))
      .toEqual({ tool: 'keep_listening' })
  })

  it('drops anything that is not one JSON object, or words around it', () => {
    expect(parseListenerResponse({ text: 'Sure! {"action":"hum","say":"Mm."}', calls: [] }, j))
      .toMatchObject({ tool: 'keep_listening', dropped: { reason: 'not JSON' } })
    expect(parseListenerResponse({ text: '[1,2]', calls: [] }, j)).toMatchObject({ dropped: { reason: 'not JSON' } })
    expect(parseListenerResponse({ text: '', calls: [] }, j)).toMatchObject({ dropped: { reason: 'not JSON' } })
  })

  it('drops a tool call made in the JSON variant', () => {
    expect(parseListenerResponse({ text: '', calls: [call('hum', { say: 'Mm.' })] }, j))
      .toMatchObject({ tool: 'keep_listening', dropped: { reason: 'two tools' } })
  })

  it('holds the same rules as the tools', () => {
    expect(parseListenerResponse(json({ action: 'close_turn', say: 'Bye.' }), { ...j, soundsFinished: false }))
      .toMatchObject({ tool: 'keep_listening', dropped: { reason: 'ends the turn outside a sounds finished call' } })
    expect(parseListenerResponse(json({ action: 'nope' }), j)).toMatchObject({ dropped: { reason: 'unknown tool', tool: 'nope' } })
    expect(parseListenerResponse(json({ say: 'Mm.' }), j)).toMatchObject({ dropped: { reason: 'no tool' } })
  })
})

describe('countWords', () => {
  it('counts words split by spaces; a hyphenated word is one', () => {
    expect(countWords('Mm-hm.')).toBe(1)
    expect(countWords("  Got it, I'll stop. ")).toBe(4)
    expect(countWords('')).toBe(0)
  })
})
