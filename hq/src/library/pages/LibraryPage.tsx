import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAction, useQuery, getLibraryAssets, removeLibraryAsset } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AddAgentDialog } from '../components/AddAgentDialog'
import { LibraryAssetList } from '../components/LibraryAssetList'
import { useLibraryTransfer } from '../components/useLibraryTransfer'
import { isStatusFilter, isTypeFilter, type LibraryFilter } from '../components/libraryFilters'
import { LIBRARY_ADD_PATH, LIBRARY_MARKETPLACE_PATH, LIBRARY_NEW_SKILL_PATH, LIBRARY_SETTINGS_PATH } from '../components/libraryRoutes'
import type { LibraryAssetRow } from '../assetList/types'

const BUTTON = 'rounded-lg border border-border px-3 py-1.5 text-body text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary'

/**
 * The Library (skills spec part 6; board U2): everything the organisation has installed for its agents, as one searched
 * view with filters by type and by state. Members read; administrators and Library maintainers act. The type and the
 * state are in the address, so a link keeps them (`/skills` opens `?type=skill`). Add and New skill lead to other
 * screens (the asset's page, Add and the editor), which are built beside this one.
 */
export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const { data, error, refetch } = useQuery(getLibraryAssets)
  const remove = useAction(removeLibraryAsset)
  const transfer = useLibraryTransfer(() => void refetch())
  const [search, setSearch] = useState('')
  const [addAgentId, setAddAgentId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null)

  const type = params.get('type')
  const status = params.get('show')
  const filter: LibraryFilter = { search, type: isTypeFilter(type) ? type : 'all', status: isStatusFilter(status) ? status : null }
  const setFilter = (next: LibraryFilter) => {
    setSearch(next.search)
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next.type === 'all') p.delete('type'); else p.set('type', next.type)
      if (next.status === null) p.delete('show'); else p.set('show', next.status)
      return p
    }, { replace: true })
  }

  const removeRow = async (row: LibraryAssetRow) => {
    if (!row.assetId) return
    setNotice(null)
    try {
      let result = await remove({ assetId: row.assetId })
      if (!result.removed) {
        if (!window.confirm(result.confirm)) return
        result = await remove({ assetId: row.assetId, confirmed: true })
      }
      setNotice({ text: `${row.title} was removed from the Library.`, failed: false })
      void refetch()
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'It could not be removed. Nothing was changed.', failed: true })
    }
  }

  const note = notice ?? transfer.message
  return (
    <AppLayout
      breadcrumbs={[{ label: 'Library' }]}
      title="Library"
      subtitle="Everything your organisation has installed for its agents. Each item is checked when it comes in, and stays at its version until you publish or update it."
      action={data ? (
        <>
          {data.marketplace && <Link to={LIBRARY_MARKETPLACE_PATH} className={BUTTON}>Marketplace</Link>}
          {data.isAdmin && <Link to={LIBRARY_SETTINGS_PATH} className={BUTTON}>Settings</Link>}
          <Link to={LIBRARY_NEW_SKILL_PATH} className={BUTTON}>New skill</Link>
          {data.mayAdd && <Link to={LIBRARY_ADD_PATH} className="rounded-lg bg-accent px-3 py-1.5 text-body font-medium text-on-accent hover:bg-accent-hover">＋ Add</Link>}
        </>
      ) : undefined}
    >
      <div className="mx-auto max-w-5xl px-4 py-5 lg:px-8">
        {note && <p role={note.failed ? 'alert' : 'status'} className={`mb-3 text-small ${note.failed ? 'text-danger' : 'text-text-secondary'}`}>{note.text}</p>}
        {error ? (
          <p role="alert" className="text-body text-danger">{error.message}</p>
        ) : !data ? (
          <p className="text-body text-text-muted">Loading…</p>
        ) : (
          <LibraryAssetList
            rows={data.rows} filter={filter} onFilter={setFilter} isAdmin={data.isAdmin}
            onCreateAgent={setAddAgentId} onExport={r => void transfer.exportOne(r.kind, r.assetId!)} onRemove={r => void removeRow(r)}
          />
        )}
      </div>
      <AddAgentDialog templateId={addAgentId} onClose={() => setAddAgentId(null)} />
    </AppLayout>
  )
}
