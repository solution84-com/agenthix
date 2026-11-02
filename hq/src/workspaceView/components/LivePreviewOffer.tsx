import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Play } from 'lucide-react'
import { useAction, startLivePreview } from 'wasp/client/operations'
import { FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { ActionBody } from '../../shared/conversations/protocol'
import { refusalOf } from '../livePreviewWords'
import { MAIN, viewAddressOf, workspaceViewPath } from '../viewAddress'
import { useFeature } from '../../features/useFeature'

/** The tool and target kind of the lead's offer (`livePreviews/offer.ts`), as the card reads them. */
export const OFFER_LIVE_PREVIEW_TOOL = 'offer_live_preview'
const OFFER_TARGET = 'livePreview'

export type LivePreviewOfferCard = { text: string; workspaceId: string; workspaceName: string; branchId: string | null; branch: string | null }

/** The offer in an ACTION message, or null for any other message or one not in its shape. */
export function livePreviewOfferOf(body: ActionBody): LivePreviewOfferCard | null {
  if (body.toolName !== OFFER_LIVE_PREVIEW_TOOL || body.target?.kind !== OFFER_TARGET || !body.target.id) return null
  const params = body.target.params ?? {}
  const branchId = typeof params.branchId === 'string' && params.branchId ? params.branchId : null
  const branch = branchId && typeof params.branch === 'string' && params.branch ? params.branch : null
  return { text: body.text, workspaceId: body.target.id, workspaceName: body.target.label, branchId: branch ? branchId : null, branch }
}

/**
 * The lead's offer of a live preview (spec part 4, *Opening one*): a card in the conversation with *Live preview*. It
 * starts nothing by itself; the person's press starts it, as from the workspace view, then opens the workspace view
 * on that branch's *Live preview*. A refusal (a Viewer, a full site, no domain) is shown as HQ worded it. Not drawn
 * while the live preview's flag is off.
 */
export function LivePreviewOffer({ card }: { card: LivePreviewOfferCard }) {
  const start = useAction(startLivePreview)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const on = useFeature('livePreview')
  const where = card.branch ?? MAIN
  const go = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await start({ workspaceId: card.workspaceId, branchId: card.branchId })
      navigate(`${workspaceViewPath(card.workspaceId)}${viewAddressOf({ branch: where, section: 'preview', file: null, diff: null })}`)
    } catch (err) {
      setProblem(refusalOf(err, 'The live preview did not start.'))
    } finally {
      setBusy(false)
    }
  }
  if (!on) return null
  return (
    <div className="mx-auto w-full max-w-[720px] px-4" data-testid="live-preview-offer">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted" aria-hidden><Play size={16} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-text-primary">Live preview · <span className="font-mono">{where}</span></p>
          <p className="text-small text-text-secondary">{card.text} <span className="text-text-muted">· {card.workspaceName}</span></p>
        </div>
        <button type="button" className={FILES_BUTTON_PRIMARY} disabled={busy} onClick={() => void go()}>
          <Play size={13} aria-hidden /> {busy ? 'Starting…' : 'Live preview'}
        </button>
        {problem && <p role="alert" className="w-full text-small text-danger">{problem}</p>}
      </div>
    </div>
  )
}
