import { useState } from 'react'
import { CopyIconButton } from './ReplyActions'
import { formatTime } from './SessionComponents'
import { modelName } from './conversationModel'
import type { TranscriptEntry } from './types'
import { FOCUS_RING } from '../primitives/controlStyles'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/** A person's message: "You · 10:24" over the text; one still waiting behind a running reply offers Send now and Cancel. */
export function ConversationUserMessage({ content, author, createdAt, runId = null, waiting = false, onSendNow, onCancel }: {
  content: string
  author?: string | null
  createdAt?: string | Date
  runId?: string | null
  waiting?: boolean
  onSendNow?: (runId: string) => Promise<unknown>
  onCancel?: (runId: string) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorDialog = useAttentionWhen(error)
  const act = async (go?: (runId: string) => Promise<unknown>) => {
    if (!go || !runId) return
    setBusy(true)
    setError(null)
    try { await go(runId) } catch (e) { setError((e as Error)?.message ?? 'That did not work.') } finally { setBusy(false) }
  }
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[72%] flex-col items-end">
        <div className="mb-1 flex items-center gap-1.5 text-micro text-text-muted">
          <span className="font-medium">{author ?? 'You'}</span>
          {createdAt && <><span aria-hidden>·</span><span>{formatTime(createdAt)}</span></>}
        </div>
        <div className="rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-2.5">
          <p className="whitespace-pre-wrap text-reading text-text-primary">{content}</p>
        </div>
        {waiting ? (
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-1 text-micro text-text-muted">
            <span>Waits for the reply to finish</span>
            {onSendNow && <button type="button" disabled={busy} onClick={() => void act(onSendNow)} className={`font-medium text-link not-disabled:hover:underline disabled:opacity-40 max-lg:min-h-10 disabled:cursor-not-allowed disabled:shadow-none ${FOCUS_RING}`}>Send now</button>}
            {onCancel && <button type="button" disabled={busy} onClick={() => void act(onCancel)} className="font-medium text-text-secondary not-disabled:hover:text-text-primary disabled:opacity-40 max-lg:min-h-10 disabled:cursor-not-allowed disabled:shadow-none">Cancel</button>}
            {errorDialog}
          </div>
        ) : (
          <div className="pt-0.5"><CopyIconButton text={content} /></div>
        )}
      </div>
    </div>
  )
}

/** A quiet centred line where the model changed. */
export function ModelChangeMarker({ model, at }: { model: string; at: string | Date }) {
  return <p className="text-center text-micro text-text-muted">Now using {modelName(model)} · {formatTime(at)}</p>
}
