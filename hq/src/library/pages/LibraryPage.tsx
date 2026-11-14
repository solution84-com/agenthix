import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAction, useQuery, getLibraryAssets, removeLibraryAsset } from 'wasp/client/operations'
import { MoreMenu } from '../../org/components/menus'
import { LibraryReviewLink } from '../../assets/pages/review/ProposalsWaiting'
import { useAttention } from '../../shared/components/AttentionDialog'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AddAgentDialog } from '../components/AddAgentDialog'
import { LibraryAssetList } from '../components/LibraryAssetList'
import { useLibraryTransfer } from '../components/useLibraryTransfer'
import { LibraryAddMenu, addWays } from '../components/LibraryAddMenu'
import { NEEDS_YOU_PARAM, isTypeFilter, type LibraryFilter } from '../components/libraryFilters'
import { SPACE_PATH } from '../../chat/chatPlacePaths'
import { LIBRARY_MARKETPLACE_PATH, LIBRARY_SETTINGS_PATH } from '../components/libraryRoutes'
import type { LibraryAssetRow } from '../assetList/types'
import { ConfirmDialog, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

// The header's quiet buttons, as ui's Button draws them (they are links here).
const QUIET = `whitespace-nowrap rounded-button px-3 py-2 text-body font-button ${ROW_ITEM}`

/**
 * The Library (board *The Library*): everything the organisation has installed for its agents, as one searched view with
 * the type chips and Needs you. Members read; administrators and Library maintainers act, through the one ＋ Add menu.
 * The type and Needs you are in the address, so a link keeps them (`/skills` opens `?type=skill`).
 */
export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const query = useQuery(getLibraryAssets)
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The Library' })
  const remove = useAction(removeLibraryAsset)
  const transfer = useLibraryTransfer()
  const [search, setSearch] = useState('')
  const [addAgentId, setAddAgentId] = useState<string | null>(null)
  const attention = useAttention()
  const [confirming, setConfirming] = useState<{ row: LibraryAssetRow; words: string } | null>(null)

  const type = params.get('type')
  const filter: LibraryFilter = { search, type: isTypeFilter(type) ? type : 'all', needsYou: params.get('show') === NEEDS_YOU_PARAM }
  const setFilter = (next: LibraryFilter) => {
    setSearch(next.search)
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next.type === 'all') p.delete('type'); else p.set('type', next.type)
      if (next.needsYou) p.set('show', NEEDS_YOU_PARAM); else p.delete('show')
      return p
    }, { replace: true })
  }

  const removeRow = async (row: LibraryAssetRow): Promise<void> => {
    if (!row.assetId) return
    try {
      const result = await remove({ assetId: row.assetId })
      if (!result.removed) { setConfirming({ row, words: result.confirm }); return }
      void refetch()
    } catch (err) {
      attention.show({ title: `${row.title} was not removed`, text: pressFailureWords(err, 'It could not be removed. Nothing was changed.'), retry: () => void removeRow(row) })
    }
  }

  const removeConfirmed = async (row: LibraryAssetRow): Promise<void> => {
    setConfirming(null)
    try {
      await remove({ assetId: row.assetId!, confirmed: true })
      void refetch()
    } catch (err) {
      attention.show({ title: `${row.title} was not removed`, text: pressFailureWords(err, 'It could not be removed. Nothing was changed.'), retry: () => void removeConfirmed(row) })
    }
  }

  const ways = data ? addWays(data) : []
  return (
    <AppLayout
      breadcrumbs={[{ label: 'Library' }]}
      title="Library"
      subtitle="What your organisation has installed for its agents."
      action={data ? (
        <>
          <LibraryReviewLink className={QUIET} />
          {data.marketplace && <Link to={LIBRARY_MARKETPLACE_PATH} className={QUIET}>Marketplace</Link>}
          {data.isAdmin && <Link to={LIBRARY_SETTINGS_PATH} className={`${QUIET} hidden lg:inline-block`}>Settings</Link>}
          {data.isAdmin && (
            <span className="lg:hidden" data-testid="library-header-more">
              <MoreMenu label="More" items={[{ label: 'Settings', onSelect: () => navigate(LIBRARY_SETTINGS_PATH) }]} />
            </span>
          )}
          <span className="hidden lg:inline-flex"><LibraryAddMenu ways={ways} /></span>
        </>
      ) : undefined}
    >
      <div className="mx-auto max-w-5xl px-4 py-5 lg:px-8">
        {data && ways.length === 0 && (
          <p className="mb-3 text-small text-text-secondary" data-testid="library-member-line">
            Organisation skills are added by admins and Library maintainers. You can make your own skills in{' '}
            <Link to={`${SPACE_PATH}?tool=skills`} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Your space ›</Link>
          </p>
        )}
        {read.nudge}
        {!data ? (
          read.failedWithoutData ? null : <p className="text-body text-text-muted">Loading…</p>
        ) : (
          <LibraryAssetList
            rows={data.rows} filter={filter} onFilter={setFilter} isAdmin={data.isAdmin} canAct={ways.length > 0}
            onCreateAgent={setAddAgentId} onExport={r => void transfer.exportOne(r.kind, r.assetId!)} onRemove={r => void removeRow(r)}
          />
        )}
        {ways.length > 0 && <div className="mt-6 flex justify-end lg:hidden"><LibraryAddMenu ways={ways} up /></div>}
      </div>
      {attention.dialog}
      <ConfirmDialog
        open={confirming !== null} title={`Remove ${confirming?.row.title ?? ''}?`} description={confirming?.words}
        confirmLabel="Remove" destructive onCancel={() => setConfirming(null)} onConfirm={() => void removeConfirmed(confirming!.row)}
      />
      {transfer.dialog}
      <AddAgentDialog templateId={addAgentId} onClose={() => setAddAgentId(null)} />
    </AppLayout>
  )
}
