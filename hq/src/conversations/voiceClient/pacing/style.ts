/**
 * The listening style the person asked for (adaptive voice listening, spec §The light model → *Listening style*): the
 * light model names it with its answer (`style`), and the page keeps it for the conversation, in memory only. Styles
 * combine: `patient` with `hums_off`; `hums_off` and `hums_fewer` replace each other; `normal` undoes them all.
 */
import type { VoiceListenStyle } from '@agenthix/core'

export type ListenStyleState = { hums: 'on' | 'off' | 'fewer'; patient: boolean }

export const NORMAL_STYLE: ListenStyleState = { hums: 'on', patient: false }

export function applyStyle(state: ListenStyleState, style: VoiceListenStyle): ListenStyleState {
  switch (style) {
    case 'hums_off': return { ...state, hums: 'off' }
    case 'hums_fewer': return { ...state, hums: 'fewer' }
    case 'patient': return { ...state, patient: true }
    case 'normal': return NORMAL_STYLE
  }
}

export const isNormal = (s: ListenStyleState) => s.hums === 'on' && !s.patient

/** The style in a few words, for the Log. */
export function styleWords(s: ListenStyleState): string {
  if (isNormal(s)) return 'normal: hums as usual, no extra wait'
  return [s.hums === 'off' ? 'no hums' : s.hums === 'fewer' ? 'fewer hums' : null, s.patient ? 'patient: waits longer, no line until the turn ends' : null]
    .filter(Boolean).join(' · ')
}
