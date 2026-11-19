import { describe, expect, it } from 'vitest'
import { HUM_KINDS, TIMING_CLASS, timingClassOf } from '../../../voiceClient/backchannel/kinds'
import { parseHum } from '../parse'

describe('the listening read\'s answer, `kind tone` @SC-2228', () => {
  it('is a kind and a tone; case and quotes around it do not matter', () => {
    expect(parseHum('sympathy gentle')).toEqual({ kind: 'sympathy', tone: 'gentle' })
    expect(parseHum(' Continuer Calm\n')).toEqual({ kind: 'continuer', tone: 'calm' })
    expect(parseHum('"delight bright"')).toEqual({ kind: 'delight', tone: 'bright' })
  })

  it('ignores anything after the tone, words included: the code picks the word', () => {
    expect(parseHum('sympathy gentle | Oh, her ankle.')).toEqual({ kind: 'sympathy', tone: 'gentle' })
    expect(parseHum('receipt calm Okay, that makes sense.')).toEqual({ kind: 'receipt', tone: 'calm' })
    expect(parseHum('continuer warm.')).toEqual({ kind: 'continuer', tone: 'warm' })
  })

  it('is none alone', () => {
    expect(parseHum('none')).toEqual({ kind: 'none', tone: null })
    expect(parseHum('None.')).toEqual({ kind: 'none', tone: null })
  })

  it('takes the kind\'s default for a tone it does not take, does not know, or none given', () => {
    expect(parseHum('sympathy bright')).toEqual({ kind: 'sympathy', tone: 'gentle' })
    expect(parseHum('delight thoughtful')).toEqual({ kind: 'delight', tone: 'bright' })
    expect(parseHum('thoughtful loud')).toEqual({ kind: 'thoughtful', tone: 'thoughtful' })
    expect(parseHum('receipt')).toEqual({ kind: 'receipt', tone: 'calm' })
    expect(parseHum('amusement warm')).toEqual({ kind: 'amusement', tone: 'bright' })
    for (const kind of HUM_KINDS) expect(parseHum(`${kind} calm`), kind).toEqual({ kind, tone: kind === 'amusement' ? 'bright' : 'calm' })
  })

  it('is unreadable (null) for anything else: never a sound by default', () => {
    for (const text of ['Oh no, that sounds awful.', 'mm-hm', 'hum', '', 'gentle sympathy', 'listen calm', '| Mm-hm.']) {
      expect(parseHum(text), text).toBeNull()
    }
  })
})

describe('the kinds\' timing classes @SC-2228', () => {
  it('maps the nine kinds to listen, react and laugh, as the spec says', () => {
    expect(TIMING_CLASS).toEqual({
      continuer: 'listen', receipt: 'listen', agreement: 'listen', thoughtful: 'listen', realisation: 'listen',
      news: 'react', sympathy: 'react', delight: 'react', amusement: 'laugh',
    })
    expect(timingClassOf('none')).toBeNull()
    expect(HUM_KINDS).toHaveLength(9)
  })
})
