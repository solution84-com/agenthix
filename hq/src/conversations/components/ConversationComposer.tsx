import { useRef, type ChangeEvent } from 'react'
import { useAuth } from 'wasp/client/auth'
import { useAction, useQuery, getModelChoices, setConversationModel, shareConversationFile } from 'wasp/client/operations'
import { Camera, ImagePlus } from 'lucide-react'
import { SHARED_KINDS_WORDS, SHARED_PICKER_ACCEPT, type PickedSkill, type SharedFile } from '@agenthix/core'
import type { ConversationView } from '../../shared/conversations/protocol'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { speakerOf, voiceHere } from '../voiceClient/voiceUi'
import { microphonePossible } from '../../shared/securePage'
import { ConversationModelPicker } from './ConversationModelPicker'
import { MessageBox } from './MessageBox'
import type { PlusItem } from './composerPlus'
import { useSharedFiles } from '../hooks/useSharedFiles'
import type { Refusal } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { SharedTray, type TextOnlyWarning } from './SharedTray'
import { textOnlyModel } from './sharedWarning'

/** A phone or tablet, whose camera ＋ can open; a pointer that hovers has none to offer. */
const hasCamera = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

/**
 * The message box of a conversation with voice wired in: the model is its own chip beside the plus (which holds
 * what `plusItems` gives it, and is hidden with none), the right button starts
 * voice or stops a reply, and while voice is on here the box shows mute and End, the silence warning and the one
 * line why voice ended or a part of it failed. ＋ adds a photo or file (and takes a photo on a phone); pasting or
 * dropping one onto the box adds it too. Each is kept in the conversation's place when Send is pressed, then sent with
 * the message; a model known to read text only is named as soon as a picture is added, with a switch.
 */
export function ConversationComposer({ conversationId, view, running, sending, onSend, onStop, plusItems, refusal }: {
  conversationId: string
  view: ConversationView
  running: boolean
  sending: boolean
  onSend: (text: string, skill?: PickedSkill, shared?: SharedFile[]) => Promise<boolean>
  onStop: () => Promise<unknown>
  /** What the plus can add; a feature that adds to the box passes its items here. */
  plusItems?: PlusItem[]
  /** The box cannot be written in now: greyed, with the reason (a closed conversation, no access). */
  refusal?: Refusal
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

  const shared = useSharedFiles(conversationId, useAction(shareConversationFile))
  const { data: choices } = useQuery(getModelChoices, { conversationId })
  const changeModel = useAction(setConversationModel)
  const pickFile = useRef<HTMLInputElement>(null)
  const takePhoto = useRef<HTMLInputElement>(null)
  const textOnly = textOnlyModel(choices)
  const warning: TextOnlyWarning | null = textOnly && {
    modelLabel: textOnly.model.label,
    agentName: agent?.name ?? 'The agent',
    switchTo: textOnly.switchTo && {
      label: textOnly.switchTo.label,
      onSwitch: () => { void changeModel({ conversationId, model: textOnly.switchTo!.value }).catch(() => undefined) },
    },
  }
  const items: PlusItem[] = [
    { id: 'shared-file', label: 'Photo or file', hint: SHARED_KINDS_WORDS, icon: <ImagePlus size={16} />, onSelect: () => pickFile.current?.click() },
    ...(hasCamera() ? [{ id: 'shared-photo', label: 'Take a photo', icon: <Camera size={16} />, onSelect: () => takePhoto.current?.click() }] : []),
    ...(plusItems ?? []),
  ]
  // The files are kept first, each once; the message waits for them, and keeps its text and tray when one can't be.
  const send = async (text: string, skill?: PickedSkill): Promise<boolean> => {
    const files = shared.items.length > 0 ? await shared.keepAll() : []
    if (files === null) return false
    const ok = await onSend(text, skill, files)
    if (ok) shared.clear()
    return ok
  }
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    shared.add([...(e.currentTarget.files ?? [])])
    e.currentTarget.value = ''
  }

  return (
    <>
      <ShowAttention
        text={inVoice && voice.warningEndsAt !== null ? 'No one has spoken for a while. Voice ends in a few seconds unless you say something.' : null}
        title="Voice is about to end"
      />
      <ShowAttention text={notice} title="Voice" onClose={clearNotice} />
      <input ref={pickFile} type="file" multiple accept={SHARED_PICKER_ACCEPT} hidden onChange={picked} data-testid="shared-picker" />
      <input ref={takePhoto} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
      <MessageBox
        agentId={agent?.id}
        conversationId={conversationId}
        takesMentions
        takesSkills
        placeholder={agent ? `Message ${agent.name}…` : 'Write a message…'}
        running={running}
        sending={sending || shared.keeping}
        onSend={send}
        // A reply being spoken stops like the person speaking over it; otherwise the turn itself is stopped.
        onStop={() => { if (!stopSpeaking()) void onStop() }}
        plusItems={items}
        tray={<SharedTray shared={shared} textOnly={warning} />}
        onFiles={shared.add}
        hasShared={shared.items.length > 0}
        refusal={refusal}
        model={<ConversationModelPicker conversationId={conversationId} model={view.talkingModel} above />}
        voice={{
          available: here.available,
          reason: here.reason,
          heldByOther,
          inVoice,
          speaker: speakerOf(voice),
          muted: voice.muted,
          onStart: () => start(conversationId, agent ? { id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl } : null),
          onPrepare: () => prepare(agent?.id, conversationId),
          onEnd: end,
          onMute: toggleMute,
          handRaised: inVoice && voice.handRaise ? { agentName: agent?.name, onInvite: invite } : null,
        }}
      />
    </>
  )
}
