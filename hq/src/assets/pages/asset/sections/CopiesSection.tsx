import { useState } from 'react'
import { Link } from 'react-router'
import { useAction, switchToOwnCopy } from 'wasp/client/operations'
import { Section, SMALL_BUTTON } from '../../../components/Section'
import { Notice, type NoticeText } from '../../../components/Notice'
import { messageOf } from '../../../components/messageOf'
import { LIBRARY_PATH } from '../../../../library/components/libraryRoutes'
import { libraryEditPath } from '../assetPaths'
import type { AssetPageView } from '../pageTypes'

/**
 * The organisation's copies of this skill that are not in use, under the original (D18): a copy set aside when the
 * original was used again, or one not published yet. The copy in use is named by the set-aside notice instead.
 */
export function CopiesSection({ page, onChanged }: { page: AssetPageView; onChanged: (message: string) => void }) {
  const again = useAction(switchToOwnCopy)
  const [notice, setNotice] = useState<NoticeText | null>(null)
  const copies = page.copies.filter(c => !c.inUse)
  if (copies.length === 0) return null
  const use = async (assetId: string) => {
    setNotice(null)
    try { onChanged(`${(await again({ assetId })).identity} is in use, in place of ${page.identity}.`) } catch (err) { setNotice({ text: messageOf(err), failed: true }) }
  }
  return (
    <Section title={copies.length === 1 ? 'Your copy' : 'Your copies'} testId="asset-copies">
      <ul className="space-y-3 text-body text-text-secondary">
        {copies.map(c => (
          <li key={c.assetId} className="space-y-1.5">
            <p>
              <Link to={`${LIBRARY_PATH}/${encodeURIComponent(c.assetId)}`} className="font-medium text-accent hover:underline">{c.identity}</Link>
              {c.version ? ` ${c.version}` : ''}: {c.published
                ? 'set aside, while this original is in use again.'
                : 'not published yet. When it is, it takes this skill’s place for the agents that have it.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {c.draftBy && <Link to={libraryEditPath(c.assetId)} className={SMALL_BUTTON}>Draft by {c.draftBy}: open it</Link>}
              {page.can.update && c.published && <button type="button" className={SMALL_BUTTON} onClick={() => void use(c.assetId)}>Use your copy again</button>}
            </div>
          </li>
        ))}
      </ul>
      <Notice notice={notice} />
    </Section>
  )
}
