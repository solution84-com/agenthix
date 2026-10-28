import { Link } from 'react-router'
import { MoreMenu, type MenuItem } from '../../org/components/menus'
import type { LibraryAssetRow as Row, LibraryKindId } from '../assetList/types'
import { libraryAssetPath, libraryProposalPath } from './libraryRoutes'

const MARK: Record<LibraryKindId, string> = { skill: 'S', agent: 'A', board: 'B', team: 'T' }

/** The words of a row's states, in the order the board shows them. */
export function statusLine(r: Row): string[] {
  const out: string[] = []
  if (r.statuses.includes('waiting')) out.push('Waiting for review')
  if (r.updateTo) out.push(`Update available · ${r.updateTo}`)
  if (r.statuses.includes('draft')) out.push(r.draftBy ? `Draft by ${r.draftBy}` : 'Draft')
  if (r.statuses.includes('setAside')) out.push('Set aside')
  if (r.statuses.includes('unsigned')) out.push('Unsigned')
  return out
}

function action(r: Row): { label: string; to: string } | 'createAgent' | null {
  if (r.proposalId) return { label: 'Review', to: libraryProposalPath(r.proposalId) }
  if (!r.assetId) return null
  const page = libraryAssetPath(r.assetId)
  if (r.statuses.includes('setAside')) return { label: 'Use this again', to: page }
  if (r.updateTo) return { label: 'Update', to: page }
  if (r.kind === 'agent') return 'createAgent'
  if (r.statuses.includes('noAgent')) return { label: 'Add to agents…', to: page }
  return null
}

const BUTTON = 'shrink-0 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover'

/** One asset of the Library (skills spec part 6; board U2): what it is, who vouches for it, who has it, its state. */
export function LibraryAssetRow({ row, isAdmin, onCreateAgent, onExport, onRemove }: {
  row: Row
  isAdmin: boolean
  onCreateAgent: (assetId: string) => void
  onExport: (row: Row) => void
  onRemove: (row: Row) => void
}) {
  const states = statusLine(row)
  const main = action(row)
  const menu: MenuItem[] = row.assetId && !row.builtIn ? [
    { label: 'Export', hint: 'Save it as a package', disabled: !isAdmin, onSelect: () => onExport(row) },
    { label: 'Remove', hint: 'Takes it out of the Library', danger: true, disabled: !isAdmin, separatorBefore: true, onSelect: () => onRemove(row) },
  ] : []
  const identity = [row.kind, row.version ? `${row.identity} · ${row.version}` : row.identity].join(' · ')
  const target = row.proposalId ? libraryProposalPath(row.proposalId) : row.assetId ? libraryAssetPath(row.assetId) : null
  const heading = (
    <>
      <span className="truncate text-body font-medium text-text-primary">{row.title}</span>
      <span className="ml-2 text-small text-text-muted">{identity}</span>
    </>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-subtle py-3 first:border-t-0" data-testid="library-row">
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-small font-semibold text-accent">{MARK[row.kind]}</span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="truncate">
          {target ? <Link to={target} className="hover:underline">{heading}</Link> : heading}
        </div>
        <div className="truncate text-small text-text-muted">
          {[row.proposedBy ?? row.signer, row.setAsideFor ? `replaced by your copy, ${row.setAsideFor}` : row.has].join(' · ')}
          {row.builtIn && row.switchedOff ? ' · switched off' : ''}
        </div>
      </div>
      {states.length > 0 && (
        <span className="flex shrink-0 flex-wrap gap-1" data-testid="library-row-states">
          {states.map(s => <span key={s} className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent">{s}</span>)}
        </span>
      )}
      {main === 'createAgent' && row.assetId && (
        <button type="button" onClick={() => onCreateAgent(row.assetId!)} className={BUTTON}>Create an agent</button>
      )}
      {main && main !== 'createAgent' && <Link to={main.to} className={BUTTON}>{main.label}</Link>}
      {menu.length > 0 && <MoreMenu items={menu} label={`More about ${row.title}`} />}
    </div>
  )
}
