/**
 * The playground's conversation in its scroll box, moving the way a conversation in the chat panel does: the person's
 * words held at the top when a turn starts, room under them for the reply, a spoken reply followed a line at a time,
 * and the person's own scroll letting go. It is the chat's own follow (useThreadFollow), not a copy.
 */
import { useLayoutEffect, useRef } from 'react'
import type { PlaygroundEntry } from '../../../shared/voicePlayground'
import type { VoiceSnapshot } from '../voiceSession'
import { useThreadFollow } from '../../hooks/useThreadFollow'
import type { LiveWords } from '../../hooks/useLiveWords'
import type { DecisionRow } from './decisions'
import { Transcript, type ReplySettled, type ReplyText, type RevealLimit } from './Transcript'

export function FollowedTranscript({ entries, decisions, snapshot, reveal, textOf, settledOf, live }: {
  entries: readonly PlaygroundEntry[]
  decisions: readonly DecisionRow[]
  snapshot: VoiceSnapshot
  reveal: RevealLimit
  textOf?: ReplyText
  settledOf?: ReplySettled
  live: LiveWords | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const newest = entries[entries.length - 1]
  const sent = [...entries].reverse().find(e => e.role === 'person')?.id ?? null
  const follow = useThreadFollow({
    box, inner, floatingHeight: 0, sent,
    replying: snapshot.phase === 'speaking' || newest?.role === 'person',
    voice: snapshot.phase !== 'off',
  })
  useLayoutEffect(() => { follow.wake() }, [entries, live?.text, snapshot.reveal, snapshot.heading])
  return (
    <div ref={box} onScroll={follow.scrolled} className="min-h-48 flex-1 overflow-y-auto [overflow-anchor:none]" data-testid="playground-scroll">
      <div ref={inner} data-testid="playground-end-space">
        <Transcript entries={entries} decisions={decisions} reveal={reveal} textOf={textOf} settledOf={settledOf} heading={snapshot.heading} live={live} />
      </div>
    </div>
  )
}
