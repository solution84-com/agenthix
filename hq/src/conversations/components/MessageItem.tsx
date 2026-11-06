import type { ReactNode } from 'react'
import { formatTime } from '@agenthix/ui/sessions'
import type { ConversationAgentView, ConversationMessageView } from '../../shared/conversations/protocol'
import { voiceLength } from '../voiceClient/voiceUi'
import type { ReplyView } from './ReplyBody'
import { SummarisedMarker } from './SummarisedMarker'
import { NewConversationOffer } from './NewConversationOffer'
import { LivePreviewOffer, livePreviewOfferOf } from '../../workspaceView/components/LivePreviewOffer'
import { ActionLine } from './ActionLine'
import { SuggestPlaceCardRow } from './SuggestPlaceCard'
import { placeSuggestionOf } from '../placesProtocol'
import { SKILL_OUTCOME_TARGET, skillCardOf } from '../../assets/proposals/types'
import { SkillCardRow } from './SkillCardRow'
import { TaskCard } from './TaskCard'
import { PersonText } from './PersonText'
import { SharedInMessage, unseenWords } from './SharedInMessage'
import { sharedFilesOf } from '@agenthix/core'
import { TurnBlockView } from './TurnBlock'
import type { WorkContext } from './WorkContext'

/** The name over someone else's message, once more than one person has spoken; null for the viewer's own and while only one has. */
function otherAuthor(authorId: string | null, work?: WorkContext): string | null {
  if (!work?.people || work.people.length < 2 || !authorId || authorId === work.myId) return null
  return work.people.find((p) => p.id === authorId)?.name ?? 'A teammate'
}

/** A person's message. One still waiting behind a reply says so and offers Send now and Cancel. */
export function PersonBubble({ message, author, waiting, busy, onSendNow, onCancel, agentName }: {
  message: Extract<ConversationMessageView, { kind: 'TEXT' }>
  /** The conversation's agent, named in the line under a message whose pictures its model could not see. */
  agentName?: string
  /** Another person's name, once more than one has spoken; their bubble sits on the other side. Absent: the viewer's own. */
  author?: string | null
  waiting?: boolean
  busy?: boolean
  onSendNow?: () => void
  onCancel?: () => void
}) {
  return (
    <div className={`flex ${author ? 'justify-start' : 'justify-end'}`} data-testid={waiting ? 'waiting-message' : 'person-message'}>
      <div className={`flex max-w-[72%] flex-col ${author ? 'items-start' : 'items-end'}`}>
        <div className="mb-1 flex items-center gap-1.5 text-micro text-text-muted">
          <span className="font-medium">{author ?? 'You'}</span>
          <span aria-hidden>·</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <SharedInMessage shared={message.body.shared} writtenAt={message.createdAt} />
        {message.body.text.trim() !== '' && (
          <div className="rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-2.5">
            <p className="whitespace-pre-wrap break-words text-reading text-text-primary"><PersonText text={message.body.text} writtenAt={message.createdAt} /></p>
          </div>
        )}
        {message.body.unseenBy && (
          <p data-testid="unseen-note" className="pt-1 text-right text-micro text-text-muted">
            {unseenWords(message.body.unseenBy, agentName ?? 'The agent', sharedFilesOf(message.body.shared).filter(f => f.kind === 'image').length || 1)}
          </p>
        )}
        {waiting && (
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-1 text-micro text-text-muted">
            <span>Waits for the reply to finish</span>
            <button type="button" disabled={busy} onClick={onSendNow} className="font-medium text-accent hover:underline disabled:opacity-50 max-lg:min-h-10">
              Send now
            </button>
            <span aria-hidden>·</span>
            <button type="button" disabled={busy} onClick={onCancel} className="font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 max-lg:min-h-10">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function QuietLine({ children }: { children: ReactNode }) {
  return <p className="text-center text-micro text-text-muted">{children}</p>
}

/**
 * One message of the record as the thread draws it (spec: On screen). Text is a bubble; the rest is one quiet
 * line or a card. The agent's words and the cards of its turn are a block (ThreadMessages groups them; one drawn
 * alone is a block of its own). Started work and requests for the person's okay are in the work bar, and the
 * person's answer to a request is not drawn.
 */
export function MessageItem({ message, agent, work, reply }: {
  message: ConversationMessageView
  agent: ConversationAgentView | null
  work?: WorkContext
  reply?: ReplyView
}) {
  switch (message.kind) {
    case 'TEXT':
      if (message.role === 'PERSON') return <PersonBubble message={message} author={otherAuthor(message.authorId, work)} agentName={agent?.name} />
      return <TurnBlockView block={{ cards: [], words: [message], set: [] }} agent={agent} work={work} reply={reply} />
    case 'FAILED':
      return <TurnBlockView block={{ cards: [], words: [message], set: [] }} agent={agent} work={work} reply={reply} />
    case 'RESULT':
      return <TurnBlockView block={{ cards: [message], words: [], set: [] }} agent={agent} work={work} reply={reply} />
    case 'NOTICE':
      return <QuietLine>{message.body.text}</QuietLine>
    case 'SUMMARISED':
      return <SummarisedMarker message={message} conversationId={work?.conversationId} />
    case 'ACTION':
      {
        // A skill an agent proposed or drafted (skills spec part 5); its review's line is for the agent, and the card shows it.
        const skill = skillCardOf(message.body)
        if (skill) return <SkillCardRow card={skill} />
        if (message.body.target?.kind === SKILL_OUTCOME_TARGET) return null
      }
      {
        const offer = livePreviewOfferOf(message.body)
        if (offer) return <LivePreviewOffer card={offer} />
      }
      if (message.body.toolName === 'offer_new_conversation' && work?.newConversationHref) {
        return <NewConversationOffer text={message.body.text} href={work.newConversationHref} />
      }
      {
        const suggestion = placeSuggestionOf(message.body)
        if (suggestion && work) {
          return (
            <div className="mx-auto w-full max-w-[720px] px-4">
              <div className="overflow-hidden rounded-lg border border-border-subtle">
                <SuggestPlaceCardRow conversationId={work.conversationId} card={suggestion} agentName={agent?.name ?? 'The agent'} canAnswer={work.canChangePlaces === true} />
              </div>
            </div>
          )
        }
      }
      return <ActionLine body={message.body} placePath={work?.placePath} />
    case 'VOICE_STARTED':
      return <QuietLine>Voice · {formatTime(message.createdAt)}</QuietLine>
    case 'VOICE_ENDED': {
      const { durationSec, reason } = message.body
      return <QuietLine>Voice ended{durationSec !== undefined ? ` · ${voiceLength(durationSec * 1000)}` : ''}{reason ? ` · ${reason}` : ''}</QuietLine>
    }
    case 'TASK':
      return <TaskCard body={message.body} />
    default:
      return null
  }
}
