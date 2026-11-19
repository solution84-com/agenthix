/**
 * Live's left pane: the conversation, with the words being heard as the person's bubble at its end, then its box: the
 * microphone (voice on or off), the message, Mute (while voice is on), Stop speaking (while the agent speaks) and Send,
 * with, while voice is on, whether it is listening or muted.
 */
import { useState } from 'react'
import { BUTTON_PRIMARY } from '@agenthix/ui/primitives'
import { Mic } from 'lucide-react'
import { Button, Input, Tooltip } from '@agenthix/ui'
import type { PlaygroundEntry } from '../../../shared/voicePlayground'
import type { VoiceSession, VoiceSnapshot } from '../voiceSession'
import type { DecisionRow } from './decisions'
import { revealLimitOf } from '../../../shared/providers/VoiceCallProvider'
import { headShown, replyTextOf } from '../reveal'
import { FollowedTranscript } from './FollowedTranscript'
import { sentKey, useLiveWords } from '../../hooks/useLiveWords'

export type LivePaneProps = {
  session: VoiceSession
  snapshot: VoiceSnapshot
  entries: readonly PlaygroundEntry[]
  decisions: readonly DecisionRow[]
  startVoice: () => void
  sendText: (text: string) => Promise<void>
  log: (line: string) => void
}

export function LivePane({ session, snapshot, entries, decisions, startVoice, sendText, log }: LivePaneProps) {
  const [text, setText] = useState('')
  const on = snapshot.phase !== 'off'
  const micLabel = on ? 'Stop talking' : 'Talk with the microphone'
  const said = useLiveWords(on ? (snapshot.muted ? '' : snapshot.partial) : undefined, sentKey([...entries].reverse().find(e => e.role === 'person')))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FollowedTranscript entries={entries} decisions={decisions} snapshot={snapshot} reveal={(turnId, text) => revealLimitOf(snapshot, turnId, text)} textOf={(turnId, text) => replyTextOf(snapshot, turnId, text)}
        settledOf={(turnId, text) => headShown(snapshot, turnId, text)} live={said}
      />
      <p className="min-h-5 text-small text-text-muted" data-testid="voice-phase" aria-live="polite">
        {on && (snapshot.muted ? 'Muted' : 'Listening')}
      </p>
      <form
        className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3"
        onSubmit={e => {
          e.preventDefault()
          const words = text.trim()
          if (!words) return
          setText('')
          sendText(words).catch((err: unknown) => log(`Not sent: ${err instanceof Error ? err.message : String(err)}`))
        }}
      >
        <Tooltip label={micLabel} side="top">
          <button
            type="button" aria-label={micLabel} aria-pressed={on} data-testid="voice-mic" onClick={() => (on ? session.end() : startVoice())}
            className={`flex size-9 shrink-0 items-center justify-center rounded-full max-sm:size-11 ${on ? 'bg-danger text-on-accent' : BUTTON_PRIMARY}`}
          >
            <Mic size={16} aria-hidden />
          </button>
        </Tooltip>
        <Input className="min-w-0 flex-1" data-testid="message-box" aria-label="Message" placeholder="Talk with the microphone, or type here" value={text} onChange={e => setText(e.target.value)} />
        {on && <Button type="button" variant="secondary" size="sm" onClick={() => session.toggleMute()}>{snapshot.muted ? 'Unmute' : 'Mute'}</Button>}
        {snapshot.phase === 'speaking' && <Button type="button" variant="secondary" size="sm" onClick={() => session.stopSpeaking()}>Stop speaking</Button>}
        <Button type="submit" size="sm" data-testid="message-send">Send</Button>
      </form>
    </div>
  )
}
