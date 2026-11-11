import { Link, useLocation } from 'react-router'
import { Hand, Mic, MicOff, X } from 'lucide-react'
import { VoiceMark } from '../../conversations/components/VoiceLine'
import { useVoiceCall } from '../providers/VoiceCallProvider'
import { useId } from 'react'
import { BUTTON_DANGER, BUTTON_GHOST, Tooltip } from '@agenthix/ui/primitives'
import { handRaiseWords, RECONNECTING_REASON, voiceLineOf } from '../../conversations/voiceClient/voiceUi'
import { useDock } from '../../dock/DockContext'
import { withConversation } from '../../dock/dockAddress'

const ICON_BUTTON = 'flex size-8 shrink-0 items-center justify-center rounded-full max-lg:size-10'

/**
 * The slim bar across the top of every page, unless the call's conversation is in sight — open in the dock, or
 * (with no root shell) on its own page: what the agent is doing, as the line above the message box says it (an icon
 * then words), the work still going, Mute, then a round End. Clicking it returns to the thread. Voice keeps going
 * while the person looks at anything else. Muted is Mute's own selected state; while the speech connection is
 * replaced it says Reconnecting… and the mic is dimmed, with the reason in its tooltip.
 */
export function VoiceBar() {
  const { voice, toggleMute, end, runtime } = useVoiceCall()
  const reconnectingId = useId()
  const location = useLocation()
  const { pathname } = location
  const dock = useDock()
  if (voice.phase === 'off' || !voice.returnTo) return null
  if (dock) {
    if (dock.open?.conversationId === voice.conversationId) return null
  } else if (voice.returnTo.split('?')[0] === pathname) return null

  // The thread opens in the dock and the canvas stays.
  const back = dock && voice.conversationId ? withConversation(location, voice.conversationId) : voice.returnTo
  const name = voice.agent?.name
  // What the agent is doing, as the line above the message box says it; the bar does not know a turn is running.
  const line = voiceLineOf(voice, false) ?? 'connecting'
  const reconnecting = !!voice.reconnecting
  const invite = () => { const rt = runtime(); rt?.publish({ kind: 'person.tap', target: 'hand-raise', t: rt.now() }) }
  return (
    <div role="region" aria-label="Voice" data-testid="voice-bar" data-state={line} data-reconnecting={reconnecting || undefined} className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-2 px-4 py-1.5">
      <Link to={back} data-testid="voice-bar-link" className="flex min-w-0 flex-1 items-center gap-2 text-small text-text-muted max-lg:min-h-10">
        <VoiceMark state={line} agentName={name ?? 'The agent'} />
        {voice.outstanding ? <span className="shrink-0 text-text-secondary"> · {voice.outstanding} working</span> : null}
      </Link>
      {voice.handRaise && (
        <button
          type="button"
          data-testid="voice-bar-hand-raised"
          aria-label={handRaiseWords(name)}
          title={handRaiseWords(name)}
          onClick={invite}
          className={`${ICON_BUTTON} ${BUTTON_GHOST} bg-selected text-text-primary`}
        >
          <Hand size={15} aria-hidden />
        </button>
      )}
      <Tooltip label={RECONNECTING_REASON} side="bottom" wrap disabled={!reconnecting}>
        <button
          type="button"
          aria-label={voice.muted ? 'Unmute' : 'Mute'}
          title={reconnecting ? undefined : voice.muted ? 'Unmute' : 'Mute'}
          aria-pressed={voice.muted}
          aria-describedby={reconnecting ? reconnectingId : undefined}
          onClick={toggleMute}
          className={`${ICON_BUTTON} ${BUTTON_GHOST} ${voice.muted ? 'bg-selected text-text-primary' : ''} ${reconnecting ? 'opacity-40' : ''}`}
        >
          {voice.muted ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
        </button>
      </Tooltip>
      {reconnecting && <span id={reconnectingId} hidden>{RECONNECTING_REASON}</span>}
      <button type="button" aria-label="End the call" title="End the call" onClick={end} className={`${ICON_BUTTON} ${BUTTON_DANGER}`}>
        <X size={15} aria-hidden />
      </button>
    </div>
  )
}
