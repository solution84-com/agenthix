import { useAuth } from 'wasp/client/auth'
import type { ConversationView } from '../../shared/conversations/protocol'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { speakerOf, voiceHere, voiceStatusWords } from '../voiceClient/voiceUi'
import { microphonePossible } from '../../shared/securePage'
import { ConversationModelPicker } from './ConversationModelPicker'
import { MessageBox } from './MessageBox'

/**
 * The message box of a conversation with voice wired in: the plus holds the model choice, the right button starts
 * voice or stops a reply, and while voice is on here the box shows mute and End, the silence warning and the one
 * line why voice ended or a part of it failed.
 */
export function ConversationComposer({ conversationId, view, running, sending, onSend, onStop }: {
  conversationId: string
  view: ConversationView
  running: boolean
  sending: boolean
  onSend: (text: string) => Promise<boolean>
  onStop: () => Promise<unknown>
}) {
  const { data: me } = useAuth()
  const { voice, start, end, toggleMute, stopSpeaking, clearNotice, prepare, runtime } = useVoiceCall()
  const agent = view.agent
  const inVoice = voice.conversationId === conversationId && voice.phase !== 'off'
  const holder = view.voice.holderId
  const heldByOther = holder !== null && holder !== (me?.id ?? null)
  const here = voiceHere(view.voice, microphonePossible())
  const notice = voice.notice && voice.noticeFor === conversationId ? voice.notice : null
  // A tap on the raised hand is the person's invitation; the hand-raise decides what follows.
  const invite = () => { const rt = runtime(); rt?.publish({ kind: 'person.tap', target: 'hand-raise', t: rt.now() }) }

  return (
    <>
      {inVoice && voice.warningEndsAt !== null && (
        <p role="status" data-testid="voice-silence-warning" className="mx-4 mb-1 text-small text-text-secondary">
          No one has spoken for a while. Voice ends in a few seconds unless you say something.
        </p>
      )}
      {notice && (
        <p role="status" data-testid="voice-notice" className="mx-4 mb-1 flex items-start justify-between gap-3 text-small text-text-secondary">
          <span>{notice}</span>
          <button type="button" onClick={clearNotice} className="shrink-0 text-text-muted hover:text-text-primary">Dismiss</button>
        </p>
      )}
      <MessageBox
        agentId={agent?.id}
        placeholder={agent ? `Message ${agent.name}…` : 'Write a message…'}
        running={running}
        sending={sending}
        onSend={onSend}
        // A reply being spoken stops like the person speaking over it; otherwise the turn itself is stopped.
        onStop={() => { if (!stopSpeaking()) void onStop() }}
        plus={<ConversationModelPicker conversationId={conversationId} model={view.talkingModel} above />}
        voice={{
          available: here.available,
          reason: here.reason,
          heldByOther,
          inVoice,
          speaker: speakerOf(voice),
          muted: voice.muted,
          onStart: () => start(conversationId, agent ? { id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl } : null),
          onPrepare: () => prepare(agent?.id),
          onEnd: end,
          onMute: toggleMute,
          handRaised: inVoice && voice.handRaise ? { agentName: agent?.name, onInvite: invite } : null,
          status: inVoice ? voiceStatusWords(voice) : null,
        }}
      />
    </>
  )
}
