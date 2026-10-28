import { useState } from 'react'
import { Link } from 'react-router'
import { useAction, useQuery, getAssetNews, dismissAssetNews, switchToOriginalAsset, switchToOwnCopy } from 'wasp/client/operations'
import { AssetChanges } from '../../../components/AssetChanges'
import { AssetFiles } from '../../../components/AssetFiles'
import { Section, SMALL_BUTTON } from '../../../components/Section'
import { Notice, type NoticeText } from '../../../components/Notice'
import { messageOf } from '../../../components/messageOf'
import { LIBRARY_PATH } from '../../../../library/components/libraryRoutes'
import type { AssetPageView, OriginalView } from '../pageTypes'

function stateWords(o: OriginalView): string {
  if (!o.inUse) return 'Set aside: this copy is in use in its place for the agents that had it.'
  if (o.copyPublished) return 'In use again: this copy is set aside.'
  return 'In use until this copy is first published; then this copy takes its place for the agents that have it.'
}

/**
 * The original under the organisation's own copy (D18; board U5): what it is and whether it is set aside, its content,
 * its own page, news of a newer version (what changed in the original, never merged) and one click to trade places.
 */
export function OriginalSection({ page, onChanged }: { page: AssetPageView; onChanged: (message: string) => void }) {
  const original = page.original!
  const { data: news } = useQuery(getAssetNews, { assetId: page.assetId })
  const back = useAction(switchToOriginalAsset)
  const again = useAction(switchToOwnCopy)
  const dismiss = useAction(dismissAssetNews)
  const [viewing, setViewing] = useState(false)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<NoticeText | null>(null)

  const act = async (work: () => Promise<{ identity: string }>, words: (identity: string) => string) => {
    setNotice(null)
    try { onChanged(words((await work()).identity)) } catch (err) { setNotice({ text: messageOf(err), failed: true }) }
  }
  const newer = news?.newer ?? null
  return (
    <Section title="The original" testId="asset-original">
      <div className="space-y-3 text-body text-text-secondary">
        <p>
          Your copy of <Link to={`${LIBRARY_PATH}/${encodeURIComponent(original.assetId)}`} className="font-medium text-accent hover:underline">{original.name}</Link>
          {original.copiedFrom ? `, copied at ${original.copiedFrom}` : ''}.
        </p>
        <p className="text-small text-text-muted">{[original.identity, original.version ? `version ${original.version}` : null, original.signedBy].filter(Boolean).join(' · ')}</p>
        <p data-testid="asset-original-state">{stateWords(original)}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SMALL_BUTTON} aria-expanded={viewing} onClick={() => setViewing(v => !v)}>{viewing ? 'Hide its content' : 'View'}</button>
          {page.can.update && !original.inUse && (
            <button type="button" className={SMALL_BUTTON} onClick={() => void act(() => back({ assetId: page.assetId }), id => `${id} is in use again, in place of your copy.`)}>Use the original again</button>
          )}
          {page.can.update && original.inUse && original.copyPublished && (
            <button type="button" className={SMALL_BUTTON} onClick={() => void act(() => again({ assetId: page.assetId }), id => `${id} is in use, in place of ${original.identity}.`)}>Use this copy again</button>
          )}
        </div>
        {viewing && <AssetFiles assetId={original.assetId} />}
        {newer ? (
          <div className="space-y-2" data-testid="asset-news-newer">
            <p className="text-text-primary">{original.identity} {newer.version} is out. Your copy is based on {news!.copiedFrom}.</p>
            <div className="flex gap-2">
              <button type="button" className={SMALL_BUTTON} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide what changed' : `See what changed in ${newer.version}`}</button>
              <button type="button" className={SMALL_BUTTON} onClick={() => void act(() => dismiss({ assetId: page.assetId, version: newer.version }), () => `News of ${original.identity} ${newer.version} is dismissed. A later version shows here again.`)}>Dismiss</button>
            </div>
            {open && <AssetChanges files={newer.files} />}
            <p className="text-small text-text-muted">This is what changed in the original, not against your copy. Bringing a change across is done by hand in the editor, with both open.</p>
          </div>
        ) : news ? <p className="text-small text-text-muted">Nothing newer from the original.</p> : null}
        <Notice notice={notice} />
      </div>
    </Section>
  )
}
