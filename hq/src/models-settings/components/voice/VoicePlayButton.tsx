import { playSample, sampleKey, stopSample, usePlayingKey } from './voicePlayer'

/** The ▶ mark of a voice: lit while its sample plays, dim when it stops. */
export function PlayMark({ lit }: { lit: boolean }) {
  return (
    <span aria-hidden className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-micro ${lit ? 'border-text-primary bg-selected text-text-primary' : 'border-border text-text-muted'}`}>
      {lit ? '▮▮' : '▶'}
    </span>
  )
}

/** A voice's ▶: plays its sample, lit while it plays. */
export function VoicePlayButton({ providerId, voiceId, description, lang }: {
  providerId: string; voiceId: string; description?: string; lang?: string
}) {
  const lit = usePlayingKey() === sampleKey(providerId, voiceId)
  return (
    <button type="button" aria-label={`${lit ? 'Stop' : 'Play'} ${voiceId}`} aria-pressed={lit}
      onClick={() => { if (lit) stopSample(); else void playSample({ providerId, voiceId, description, lang }) }}>
      <PlayMark lit={lit} />
    </button>
  )
}
