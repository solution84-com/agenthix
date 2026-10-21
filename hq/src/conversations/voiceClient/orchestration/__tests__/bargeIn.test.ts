import { describe, expect, it } from 'vitest'
import type { FloorState } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { bargeIn } from '../bargeIn'
import { heard, rig, silence } from './setup'

const { confirmWindowMs, unclearExtraMs } = VOICE_SETTINGS.bargeIn

/** Barge-in over a reply being spoken; the floor is set by hand, as the floor component would. */
function setup(floor: FloorState = 'agent-speaking') {
  const r = rig([bargeIn], ['orchestration.playback', 'stt.person'])
  r.at(0, { kind: 'reply.sentence', replyId: 'r1', index: 0, text: 'Here is the plan.' })
  r.at(0, { kind: 'orchestration.floor', state: floor })
  const actions = () => r.out.map(e => (e.kind === 'orchestration.playback' ? e.action : e.kind === 'stt.person' ? `person:${e.text}` : e.kind))
  return { ...r, actions }
}

describe('barge-in: duck at once', () => {
  it('ducks the reply the moment the person’s voice is heard over it', () => {
    const b = setup()
    b.at(1_000, silence(false))
    expect(b.out).toEqual([expect.objectContaining({ kind: 'orchestration.playback', action: 'duck', replyId: 'r1', t: 1_000 })])
  })

  it('does nothing when the agent is not speaking', () => {
    const b = setup('open')
    b.at(1_000, silence(false))
    expect(b.out).toEqual([])
  })
})

describe('barge-in: confirm from the words in the window', () => {
  it('stops on a stop word, even one, and passes the words on once the stop is delivered', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_600, heard('wait'))
    expect(b.actions()).toEqual(['duck', 'stop', 'person:wait'])
    expect(b.out.find(e => e.kind === 'orchestration.playback' && e.action === 'stop')).toMatchObject({ by: 'stop-word' })
  })

  it('stops on "hold on" and "hang on"', () => {
    for (const words of ['Hold on.', 'hang on a second']) {
      const b = setup()
      b.at(1_000, silence(false))
      b.at(1_500, heard(words))
      expect(b.actions()).toEqual(['duck', 'stop', `person:${words}`])
    }
  })

  it('stops on two or more of the person’s own words', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_700, heard('actually the second'))
    expect(b.actions()).toEqual(['duck', 'stop', 'person:actually the second'])
  })

  it('resumes on an acknowledgement alone, at the end of the window, and drops the words', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_500, heard('Mm-hmm, yeah.'))
    b.at(1_800, silence(true))
    b.tickTo(1_000 + confirmWindowMs - 50)
    expect(b.actions()).toEqual(['duck'])
    b.tickTo(1_000 + confirmWindowMs + 50)
    expect(b.actions()).toEqual(['duck', 'resume'])
  })

  it('stops when an acknowledgement turns into words of the person’s own', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_400, heard('yeah'))
    b.at(1_900, heard('yeah but the cost'))
    expect(b.actions()).toEqual(['duck', 'stop', 'person:yeah but the cost'])
  })

  it('resumes when nothing is said and silence returns: a cough', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_200, silence(true))
    b.tickTo(1_000 + confirmWindowMs + 50)
    expect(b.actions()).toEqual(['duck', 'resume'])
  })

  it('stays ducked a little longer on one unclear word, and resumes if nothing follows', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_500, heard('Actually'))
    b.at(1_700, silence(true))
    b.tickTo(1_000 + confirmWindowMs + 50)
    expect(b.actions()).toEqual(['duck'])
    b.tickTo(1_000 + confirmWindowMs + unclearExtraMs + 100)
    expect(b.actions()).toEqual(['duck', 'resume'])
  })

  it('stops when a second word follows an unclear one', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_500, heard('Actually'))
    b.tickTo(1_000 + confirmWindowMs + 100)
    b.at(2_700, heard('Actually never'))
    expect(b.actions()).toEqual(['duck', 'stop', 'person:Actually never'])
  })

  it('does not duck again for the rest of an acknowledgement it already let go', () => {
    const b = setup()
    b.at(1_000, silence(false))
    b.at(1_400, heard('yeah'))
    b.at(1_600, silence(true))
    b.tickTo(1_000 + confirmWindowMs + 50)
    b.at(2_700, heard('Yeah.', 1, true))
    expect(b.actions()).toEqual(['duck', 'resume'])
  })
})

describe('barge-in: words heard without the voice detected first', () => {
  it('still stops on enough of the person’s own words, as today', () => {
    const b = setup()
    b.at(1_000, heard('wait a moment'))
    expect(b.actions()).toEqual(['stop', 'person:wait a moment'])
  })

  it('lets one stray word over the reply go', () => {
    const b = setup()
    b.at(1_000, heard('Up.'))
    expect(b.out).toEqual([])
  })
})

describe('barge-in: the person’s words when the agent is not speaking', () => {
  it('passes them on as the person’s, one word or more', () => {
    const b = setup('open')
    b.at(1_000, heard('yes'))
    expect(b.actions()).toEqual(['person:yes'])
  })

  it('ignores a transcript with nothing of the person’s in it', () => {
    const b = setup('open')
    b.at(1_000, heard(''))
    expect(b.out).toEqual([])
  })
})

describe('barge-in: the stop button', () => {
  it('stops the reply while it plays or is ducked, and not otherwise', () => {
    const b = setup('ducked')
    b.at(500, { kind: 'person.tap', target: 'stop' })
    expect(b.actions()).toEqual(['stop'])
    const c = setup('open')
    c.at(500, { kind: 'person.tap', target: 'stop' })
    expect(c.out).toEqual([])
  })
})
