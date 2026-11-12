import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { getDemoInfo, useQuery } from 'wasp/client/operations'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { voiceLineOf } from '../voiceClient/voiceUi'
import { VoiceMark } from './VoiceLine'

/** The label the voice screen carries in the demo (live demo spec, *Voice is in, as a demo voice*). */
export const DEMO_VOICE_LABEL = 'Demo voice — scripted lines, nothing you say is listened to'

const LINE = `rounded-full bg-chip px-3 py-1 text-left text-small text-text-primary transition-colors not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`

/**
 * The demo's voice call, above the message box in place of a microphone: the label, what the agent said first, and
 * the lines the person can say as buttons. A tap sends the line as their message and the agent answers aloud from its
 * recorded clip; nothing is listened to. It is opaque, and the call's state (speaking, waiting for a line) is its first
 * row, so that line takes the panel's room rather than floating over the thread. Thinking is the run's own line, above.
 */
export function DemoVoicePanel({ agentHandle, agentName, running = false }: { agentHandle: string | undefined; agentName: string | undefined; running?: boolean }) {
  const { voice, say } = useVoiceCall()
  const { data } = useQuery(getDemoInfo, undefined, { staleTime: Infinity, gcTime: Infinity })
  const info = data?.on && agentHandle ? data.agents[agentHandle] : undefined
  const state = voiceLineOf(voice, running)
  return (
    <section aria-label="Demo voice" data-testid="demo-voice" className="relative mx-4 mb-2 rounded-xl bg-surface-1 px-3 py-2">
      {state && state !== 'thinking' && (
        <div className="flex min-w-0 items-center gap-2 pb-1 text-small text-text-muted" data-testid="voice-line" data-state={state}>
          <VoiceMark state={state} agentName={agentName ?? 'The agent'} scripted />
        </div>
      )}
      <p className="text-small text-text-muted" data-testid="demo-voice-label">{DEMO_VOICE_LABEL}</p>
      {info?.firstVoiceLine && (
        <p className="pt-1 text-small text-text-secondary" data-testid="demo-voice-first">
          <span className="text-text-muted">{agentName ?? 'The agent'}: </span>{info.firstVoiceLine.text}
        </p>
      )}
      <div role="group" aria-label="Lines you can say" className="flex flex-wrap gap-1.5 pt-2">
        {info?.voiceLines.map(line => (
          <button
            key={line.id}
            type="button"
            className={LINE}
            disabled={!say || voice.phase !== 'listening'}
            onClick={() => say?.({ text: line.text, clip: line.clip })}
          >
            {line.text}
          </button>
        ))}
      </div>
    </section>
  )
}
