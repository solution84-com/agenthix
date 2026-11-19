/**
 * The listening read's answer, read (spec §The listening read): one line, `kind tone`, or `none`. The read never picks
 * the words: the code does, from the kind's list (`../../voiceClient/backchannel/library`), so anything after the tone
 * — words the model added anyway included — is ignored. A tone the kind does not take, does not know, or none given,
 * is the kind's default. Anything else is unreadable (null): never a sound by default.
 */
import type { VoiceHumKind } from '@agenthix/core'
import { isHumKind, isHumTone, type HumKind, type HumTone } from '../../voiceClient/backchannel/kinds'
import { toneFor } from '../../voiceClient/backchannel/library'

export type HumAnswer =
  | { kind: Extract<VoiceHumKind, 'none'>; tone: null }
  | { kind: HumKind; tone: HumTone }

export function parseHum(text: string): HumAnswer | null {
  const line = text.trim().replace(/^["'`]+|["'`]+$/g, '').trim()
  if (/^none[.!]?$/i.test(line)) return { kind: 'none', tone: null }
  const [kind, tone] = line.split('|')[0]!.toLowerCase().split(/[\s,.:;!]+/).filter(Boolean)
  if (!isHumKind(kind)) return null
  return { kind, tone: toneFor(kind, isHumTone(tone) ? tone : null) }
}
