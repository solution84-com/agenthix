import { Link, useLocation } from 'react-router'
import { Hand, Mic, MicOff } from 'lucide-react'
import { AuthedAgentAvatar } from '../components/AuthedAgentAvatar'
import { useVoiceCall } from '../providers/VoiceCallProvider'
import { handRaiseWords, speakerOf, speakerWords, voiceStatusWords } from '../../conversations/voiceClient/voiceUi'
import { useDock } from '../../dock/DockContext'
import { withConversation } from '../../dock/dockAddress'

/**
 * The slim bar across the top of every page, unless the call's conversation is in sight — open in the dock, or
 * (with no root shell) on its own page: the agent, who is talking, the work still going, mute and End. Clicking it returns
 * to the thread. Voice keeps going while the person looks at anything else.
 */
export function VoiceBar() {
  const { voice, toggleMute, end, runtime } = useVoiceCall()
  const location = useLocation()
  const { pathname } = location
  const dock = useDock()
  if (voice.phase === 'off' || !voice.returnTo) return null
  if (dock) {
    if (dock.open?.conversationId === voice.conversationId) return null
  } else if (voice.returnTo.split('?')[0] === pathname) return null

  // The thread opens in the dock and the canvas stays.
  const back = dock && voice.conversationId ? withConversation(location, voice.conversationId) : voice.returnTo
  const speaker = speakerOf(voice)
  const name = voice.agent?.name
  const doing = voiceStatusWords(voice) ?? (speakerWords(speaker, name) || 'Starting voice')
  const invite = () => { const rt = runtime(); rt?.publish({ kind: 'person.tap', target: 'hand-raise', t: rt.now() }) }
  return (
    <div role="region" aria-label="Voice" data-testid="voice-bar" data-speaker={speaker} className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-accent-subtle px-4 py-1.5">
      <Link to={back} className="flex min-w-0 flex-1 items-center gap-2.5 text-small text-text-primary max-lg:min-h-10">
        {voice.agent && <AuthedAgentAvatar name={voice.agent.name} avatarUrl={voice.agent.avatarUrl} size="sm" />}
        <span className="min-w-0 truncate">
          <span className="font-medium">{name ?? 'Voice'}</span>
          <span aria-hidden className="px-1.5 text-text-muted">·</span>
          <span className="text-text-secondary">{doing}</span>
          {voice.outstanding ? <span className="text-text-secondary"> · {voice.outstanding} working</span> : null}
        </span>
      </Link>
      {voice.handRaise && (
        <button
          type="button"
          data-testid="voice-bar-hand-raised"
          aria-label={handRaiseWords(name)}
          title={handRaiseWords(name)}
          onClick={invite}
          className="flex size-8 items-center justify-center rounded-full bg-accent-subtle text-accent ring-1 ring-accent/40 hover:bg-accent/20 max-lg:size-10"
        >
          <Hand size={15} aria-hidden />
        </button>
      )}
      <button
        type="button"
        aria-label={voice.muted ? 'Unmute' : 'Mute'}
        aria-pressed={voice.muted}
        onClick={toggleMute}
        className="flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover max-lg:size-10"
      >
        {voice.muted ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
      </button>
      <button type="button" onClick={end} className="h-8 rounded-full bg-danger px-3 text-small font-medium text-on-accent hover:bg-danger-hover max-lg:h-10">
        End
      </button>
    </div>
  )
}
