import { useState } from 'react'
import { useAction, useQuery, getAssetNews, dismissAssetNews, switchToOriginalAsset, switchToOwnCopy } from 'wasp/client/operations'
import { AssetChanges } from '../../../components/AssetChanges'
import { Section, SMALL_BUTTON } from '../../../components/Section'
import { Notice, type NoticeText } from '../../../components/Notice'
import { messageOf } from '../../../components/messageOf'
import type { AssetPageView } from '../pageTypes'

/**
 * *News* on the organisation's own copy (D18; board U5): a newer version of the original is shown here, as what changed
 * in the original between the version copied and the new one, never merged. Bringing a change across is done by hand
 * in the editor. Also where the copy and the original trade places: one click either way.
 */
export function NewsSection({ page, onChanged }: { page: AssetPageView; onChanged: (message: string) => void }) {
  const { data: news } = useQuery(getAssetNews, { assetId: page.assetId })
  const back = useAction(switchToOriginalAsset)
  const again = useAction(switchToOwnCopy)
  const [open, setOpen] = useState(false)
  const dismiss = useAction(dismissAssetNews)
  const [notice, setNotice] = useState<NoticeText | null>(null)
  if (!news) return null

  const switchTo = async (work: () => Promise<{ identity: string }>, words: (identity: string) => string) => {
    setNotice(null)
    try { onChanged(words((await work()).identity)) } catch (err) { setNotice({ text: messageOf(err), failed: true }) }
  }
  return (
    <Section title="News from the original" testId="asset-news">
      <div className="space-y-3 text-body text-text-secondary">
        <p>Your copy of <strong className="text-text-primary">{news.original}</strong>, copied at {news.copiedFrom}. {news.inUse ? 'It is in use in place of the original.' : "It isn't in use: the original is."}</p>
        {news.newer ? (
          <div className="space-y-2" data-testid="asset-news-newer">
            <p className="text-text-primary">{news.original} {news.newer.version} is out. Your copy is based on {news.copiedFrom}.</p>
            <div className="flex gap-2">
              <button type="button" className={SMALL_BUTTON} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide what changed' : `See what changed in ${news.newer.version}`}</button>
              <button type="button" className={SMALL_BUTTON} onClick={() => void switchTo(() => dismiss({ assetId: page.assetId, version: news.newer!.version }), () => `News of ${news.original} ${news.newer!.version} is dismissed. A later version shows here again.`)}>Dismiss</button>
            </div>
            {open && <AssetChanges files={news.newer.files} />}
            <p className="text-small text-text-muted">This is what changed in the original, not against your copy. Bringing a change across is done by hand in the editor, with both open.</p>
          </div>
        ) : <p className="text-small text-text-muted">Nothing newer from the original.</p>}
        {page.can.update && (
          news.inUse
            ? <button type="button" className={SMALL_BUTTON} onClick={() => void switchTo(() => back({ assetId: page.assetId }), id => `${id} is in use again, in place of your copy.`)}>Switch back to {news.original}</button>
            : <button type="button" className={SMALL_BUTTON} onClick={() => void switchTo(() => again({ assetId: page.assetId }), id => `${id} is in use, in place of ${news.original}.`)}>Use this copy again</button>
        )}
        <Notice notice={notice} />
      </div>
    </Section>
  )
}
