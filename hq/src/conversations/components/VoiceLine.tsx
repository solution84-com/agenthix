import { LiveLine, type LiveRun } from './LiveLine'
import { voiceLineWords, type VoiceLineState } from '../voiceClient/voiceUi'

/** Five small bars: still while the agent listens, moving while it speaks. */
function Bars({ moving }: { moving: boolean }) {
  return (
    <span aria-hidden className="flex h-3.5 items-center gap-0.5" data-testid="voice-line-bars">
      {[0, 250, 100, 320, 180].map((delay) => (
        <span
          key={delay}
          className={`h-1 w-[2.5px] rounded-full bg-text-muted ${moving ? 'voice-line-bar' : ''}`}
          style={moving ? { animationDelay: `${delay}ms` } : undefined}
        />
      ))}
    </span>
  )
}

/** A turning ring: solid while voice connects, dashed and slower while it reconnects. */
function Ring({ dashed }: { dashed: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-3.5 rounded-full border-2 motion-safe:animate-spin ${dashed ? 'border-dashed border-text-muted [animation-duration:1.8s]' : 'border-border-subtle border-t-text-muted'}`}
    />
  )
}

/**
 * The line above the message box in a call: what the agent is doing, an icon then words, the icon always in the same
 * place so the words never move. Thinking is the run's own line (LiveLine), as out of a call. The person's microphone
 * is not said here: Mute is its own button.
 */
export function VoiceLine({ state, agentName, run }: { state: VoiceLineState; agentName: string; run: LiveRun }) {
  if (state === 'thinking') return <LiveLine agentName={agentName} run={run} />
  return (
    <div className="flex min-w-0 items-center gap-2 px-8 pb-1.5 text-small text-text-muted" data-testid="voice-line" data-state={state}>
      <VoiceMark state={state} agentName={agentName} />
    </div>
  )
}

/** The icon and the words alone, for the voice bar on other pages; thinking is the dots and its plain words there. */
export function VoiceMark({ state, agentName }: { state: VoiceLineState; agentName: string }) {
  const icon = state === 'thinking'
    ? (
        <span className="flex items-center gap-0.5">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="live-line-dot h-1.5 w-1.5 rounded-full bg-text-muted" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
      )
    : state === 'connecting' || state === 'reconnecting'
      ? <Ring dashed={state === 'reconnecting'} />
      : <Bars moving={state === 'speaking'} />
  return (
    <>
      <span aria-hidden className="flex w-[22px] shrink-0 items-center justify-start">{icon}</span>
      <span role="status" className={`min-w-0 ${state === 'ending' ? '' : 'truncate'}`}>{state === 'thinking' ? `${agentName} is thinking` : voiceLineWords(state, agentName)}</span>
    </>
  )
}
