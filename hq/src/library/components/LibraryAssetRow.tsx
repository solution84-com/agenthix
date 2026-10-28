import { Link, useNavigate } from 'react-router'
import { MoreMenu, type MenuItem } from '../../org/components/menus'
import type { LibraryAssetRow as Row, LibraryKindId } from '../assetList/types'
import { libraryAssetPath, libraryProposalPath, libraryUseTeamPath } from './libraryRoutes'

const MARK: Record<LibraryKindId, string> = { skill: 'S', agent: 'A', board: 'B', team: 'T' }

/** The words of a row's states, in the order the board shows them. */
export function statusLine(r: Row): string[] {
  const out: string[] = []
  if (r.statuses.includes('waiting')) out.push('Waiting for review')
  if (r.updateTo) out.push(`Update available · ${r.updateTo}`)
  if (r.statuses.includes('draft')) out.push(r.draftBy ? `Draft by ${r.draftBy}` : 'Draft')
  if (r.statuses.includes('setAside')) out.push('Set aside')
  if (r.statuses.includes('unsigned')) out.push('Unsigned')
  for (const p of r.partners) {
    if (p.statuses.includes('setAside')) out.push(p.relation === 'original' ? 'Original set aside' : 'Your copy set aside')
    if (p.statuses.includes('draft')) out.push(p.draftBy ? `Draft of your copy by ${p.draftBy}` : 'Draft of your copy')
  }
  return out
}

/** What the row says about who has it, with the copy or original it stands for besides itself (D18). */
export function whoLine(r: Row): string[] {
  const original = r.partners.find(p => p.relation === 'original')
  const copies = r.partners.filter(p => p.relation === 'copy').map(p =>
    `Your copy ${p.words} ${p.statuses.includes('setAside') ? 'is set aside' : "isn't published yet"}`)
  return [
    r.proposedBy ?? r.signer,
    ...(original ? [`Your copy of ${original.words}`] : []),
    r.setAsideFor ? `replaced by your copy, ${r.setAsideFor}` : r.has,
    ...copies,
  ]
}

function action(r: Row): { label: string; to: string } | 'createAgent' | 'useTeam' | null {
  if (r.proposalId) return { label: 'Review', to: libraryProposalPath(r.proposalId) }
  if (!r.assetId) return null
  const page = libraryAssetPath(r.assetId)
  if (r.statuses.includes('setAside')) return { label: 'Use this again', to: page }
  if (r.updateTo) return { label: 'Update', to: page }
  if (r.kind === 'agent') return 'createAgent'
  if (r.kind === 'team') return 'useTeam'
  if (r.statuses.includes('noAgent')) return { label: 'Add to agents…', to: page }
  return null
}

/** The title's link, whose ::after covers the whole row, so the row is the tap target; the ⋯ menu comes after it, so it sits above it without a z-index that would put the next row over an open menu. */
const ROW_LINK = [
  'rounded-lg after:absolute after:inset-0 after:rounded-lg after:content-[\'\']',
  'focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent',
].join(' ')

/** One asset of the Library (skills spec part 6; board U2): what it is, who vouches for it, who has it, its state. The row is one target, which opens the asset; every action is in its ⋯ menu. */
export function LibraryAssetRow({ row, isAdmin, onCreateAgent, onExport, onRemove }: {
  row: Row
  isAdmin: boolean
  onCreateAgent: (assetId: string) => void
  onExport: (row: Row) => void
  onRemove: (row: Row) => void
}) {
  const navigate = useNavigate()
  const states = statusLine(row)
  const main = action(row)
  const mainItem: MenuItem[] = main === 'createAgent' && row.assetId
    ? [{ label: 'Create an agent', onSelect: () => onCreateAgent(row.assetId!) }]
    : main === 'useTeam' && row.assetId
      ? [{ label: 'Use this team', hint: 'Choose what to make from it', disabled: !isAdmin, onSelect: () => navigate(libraryUseTeamPath(row.assetId!)) }]
    : main && main !== 'createAgent' && main !== 'useTeam' ? [{ label: main.label, onSelect: () => navigate(main.to) }] : []
  const menu: MenuItem[] = [
    ...mainItem,
    ...(row.assetId && !row.builtIn ? [
      { label: 'Export', hint: 'Save it as a package', disabled: !isAdmin, onSelect: () => onExport(row), separatorBefore: mainItem.length > 0 },
      { label: 'Remove', hint: 'Takes it out of the Library', danger: true, disabled: !isAdmin, separatorBefore: true, onSelect: () => onRemove(row) },
    ] : []),
  ]
  const identity = [row.kind, row.version ? `${row.identity} · ${row.version}` : row.identity].join(' · ')
  const target = row.proposalId ? libraryProposalPath(row.proposalId) : row.assetId ? libraryAssetPath(row.assetId) : null
  const heading = (
    <>
      <span className="truncate text-body font-medium text-text-primary">{row.title}</span>
      <span className="ml-2 text-small text-text-muted">{identity}</span>
    </>
  )
  return (
    <div className={`relative flex items-start gap-x-3 border-t border-border-subtle py-3 first:border-t-0${target ? ' -mx-2 rounded-lg px-2 hover:bg-surface-hover' : ''}`} data-testid="library-row">
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-small font-semibold text-accent">{MARK[row.kind]}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate">
          {target ? <Link to={target} className={ROW_LINK}>{heading}</Link> : heading}
        </div>
        <div className="truncate text-small text-text-muted">
          {whoLine(row).join(' · ')}
          {row.builtIn && row.switchedOff ? ' · switched off' : ''}
        </div>
        {states.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1" data-testid="library-row-states">
            {states.map(s => <span key={s} className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent">{s}</span>)}
          </div>
        )}
      </div>
      {menu.length > 0 && <span className="relative shrink-0"><MoreMenu items={menu} label={`More about ${row.title}`} /></span>}
    </div>
  )
}
