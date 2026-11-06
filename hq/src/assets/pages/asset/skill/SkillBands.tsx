import { Link } from 'react-router'
import { useAction, switchToOriginalAsset } from 'wasp/client/operations'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { LIBRARY_PATH } from '../../../../library/components/libraryRoutes'
import { messageOf } from '../../../components/messageOf'
import type { AssetPageView } from '../pageTypes'
import type { VersionRow } from './SkillVersionMenu'
import { lookingAtWords } from './skillWords'

const BAND = 'shrink-0 border-b border-border-subtle px-4 py-1.5 text-small lg:px-6'
const LINK = 'font-medium text-accent hover:underline'

/**
 * The lines between a skill's header and its files, each said once: the older version in view, unsigned,
 * set aside for the organisation's copy, and a newer version offered.
 */
export function SkillBands({ page, older, onChanged, onUpdate }: {
  page: AssetPageView
  older: VersionRow | null
  onChanged: (message: string) => void
  onUpdate: () => void
}) {
  const back = useAction(switchToOriginalAsset)
  const { show, dialog } = useAttention()
  const switchBack = (): void => {
    void back({ assetId: page.setAsideFor!.assetId }).then(
      () => onChanged(`${page.identity} is in use again.`),
      err => show({ title: 'It could not be used again', text: messageOf(err), retry: switchBack }),
    )
  }
  return (
    <>
      {older && (
        <p className={`${BAND} bg-warning/15 text-text-primary`} role="status" data-testid="older-version">
          {lookingAtWords(older.version, page.version)}
          {older.withdrawn && <span className="text-warning"> The publisher withdrew it: {older.withdrawn}</span>}
        </p>
      )}
      {page.unsigned && <p className={`${BAND} text-warning`} data-testid="asset-unsigned">Unsigned: nobody vouches for who made it.</p>}
      {page.setAsideFor && (
        <p className={`${BAND} text-text-secondary`} aria-label="Set aside" data-testid="asset-set-aside">
          Set aside. Your copy, <Link to={`${LIBRARY_PATH}/${encodeURIComponent(page.setAsideFor.assetId)}`} className={LINK}>{page.setAsideFor.identity}</Link>, has taken its place for the agents that had it.
          {page.can.update && (
            <> <button type="button" className={LINK} onClick={switchBack}>Use this again</button></>
          )}
        </p>
      )}
      {dialog}
      {page.update && !older && (
        <p className={`${BAND} bg-accent-subtle text-text-primary`} data-testid="asset-update-line">
          {page.update.version} is out. <button type="button" className={LINK} onClick={onUpdate}>See what changes…</button>
        </p>
      )}
    </>
  )
}
