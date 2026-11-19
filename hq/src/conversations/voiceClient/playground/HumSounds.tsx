/**
 * "Hear the sounds" (spec §The sound keeper): the hum library's sounds hq sent the page's keeper in this voice session,
 * each with its kind and tone and whether it was made new or already made for the voice, played on a press; voice
 * ending forgets them, as the keeper does. Each
 * tone's steering can be changed, for this page only: sounds made from then on take it, and the code's table stays as
 * it is. A steering the owner settles on reaches the code by hand, through the lead (`../backchannel/kinds`).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP, type VoiceBackchannelSoundEvent } from '@agenthix/core'
import { Button, Input } from '@agenthix/ui'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { playgroundEvent } from '../../../shared/voicePlayground'
import { HUM_TONES, SOUND_STEERING, soundKey, type HumTone } from '../backchannel/kinds'
import { bufferOf } from '../adapters/linePlayer'
import type { LooseSocket } from '../voiceSession'
import type { PlaygroundSettings } from './settings'

type Kept = { key: string; words: string; kind: string; tone: HumTone; audio: ArrayBuffer | null; made?: 'new' | 'kept' }

/** Plays 24 kHz PCM16 mono once. */
function usePlayer() {
  const context = useRef<AudioContext | null>(null)
  return (audio: ArrayBuffer) => {
    const ctx = (context.current ??= new AudioContext())
    const pcm = new Int16Array(audio)
    const buffer = ctx.createBuffer(1, Math.max(1, pcm.length), 24_000)
    const out = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32_768
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
  }
}

export function HumSounds({ socket, settings }: { socket: LooseSocket; settings: PlaygroundSettings }) {
  const { humSteering } = useSyncExternalStore(settings.subscribe, settings.get)
  const [kept, setKept] = useState<Kept[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<HumTone, string>>>({})
  const play = usePlayer()

  useEffect(() => {
    const sound = (e: VoiceBackchannelSoundEvent) => {
      const key = soundKey(e.words, e.tone)
      const audio = !e.failed && e.audio ? bufferOf(e.audio) : null
      setKept(list => [...list.filter(k => k.key !== key), { key, words: e.words, kind: e.kind, tone: e.tone, audio, ...(e.made && { made: e.made }) }])
    }
    const ended = () => setKept([])
    socket.on(playgroundEvent(VP.backchannelSound), sound as never)
    socket.on(playgroundEvent(V.ended), ended as never)
    return () => { socket.off(playgroundEvent(VP.backchannelSound), sound as never); socket.off(playgroundEvent(V.ended), ended as never) }
  }, [socket])

  const steeringOf = (tone: HumTone) => humSteering[tone] ?? SOUND_STEERING[tone]

  const apply = (tone: HumTone) => {
    const draft = (drafts[tone] ?? steeringOf(tone)).trim()
    if (!draft) {
      const { [tone]: _cleared, ...rest } = humSteering
      settings.patch({ humSteering: rest })
      setNote(`Sounds in a ${tone} tone made from now on take ${SOUND_STEERING[tone] || 'no direction'}.`)
      return
    }
    if (!/^\[[^\]]+\]$/.test(draft)) { setNote('A steering is one direction in square brackets, such as [warm, encouraging].'); return }
    settings.patch({ humSteering: { ...humSteering, [tone]: draft } })
    setNote(`Sounds in a ${tone} tone made from now on take ${draft}.`)
  }

  return (
    <section aria-label="Hear the sounds" data-testid="hum-sounds" className="flex flex-col gap-2 px-3 py-2 text-micro text-text-secondary">
      <span role="status" className="text-text-muted">
        {note ?? (kept.length ? `${kept.length} sounds here in this voice session.` : 'No sounds yet: the common ones come as voice starts, and each kind as the listening read first says it.')}
      </span>
      <ol className="m-0 flex list-none flex-wrap gap-1 p-0" data-testid="hum-kept">
        {kept.map(k => (
          <li key={k.key}>
            <button
              type="button" disabled={!k.audio} title={`${k.kind}, ${k.tone}`} onClick={() => k.audio && play(k.audio)}
              className="rounded border border-border px-1.5 text-text-primary not-disabled:hover:bg-surface-hover disabled:text-text-muted"
            >
              {k.words} <span className="text-text-muted">{k.kind} · {k.tone}{k.audio ? (k.made === 'new' ? ' · made new' : ' · already made') : ' · not made'}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
        {HUM_TONES.map(tone => (
          <div key={tone} className="contents" data-testid={`hum-tone-${tone}`}>
            <span className="font-medium text-text-primary">{tone}</span>
            <Input aria-label={`Steering for ${tone}`} value={drafts[tone] ?? steeringOf(tone)} onChange={e => setDrafts(d => ({ ...d, [tone]: e.target.value }))} />
            <Button variant="secondary" onClick={() => apply(tone)}>Apply</Button>
          </div>
        ))}
      </div>
    </section>
  )
}
