import { Link, useNavigate } from 'react-router'
import { Lock } from 'lucide-react'
import { CARD_CLICKABLE_IN_GROUP } from '@agenthix/ui/primitives'
import { MoreMenu, type MenuItem } from '../../org/components/menus'
import { AgentStack } from '../../assets/components/AgentStack'
import type { LibraryAssetRow as Row } from '../assetList/types'
import { cardPublisherWords, cardTag, rowStateWords } from '../assetList/words'
import { KindTile } from './KindTile'
import { libraryAssetPath, libraryProposalPath, libraryTaskTemplateProposalPath, libraryUseTeamPath } from './libraryRoutes'

const proposalPath = (r: Row, proposalId: string) => (r.kind === 'task-template' ? libraryTaskTemplateProposalPath : libraryProposalPath)(proposalId)

function action(r: Row): { label: string; to: string } | 'createAgent' | 'useTeam' | null {
  if (r.proposalId) return { label: 'Review', to: proposalPath(r, r.proposalId) }
  if (!r.assetId) return null
  const page = libraryAssetPath(r.assetId)
  if (r.statuses.includes('setAside')) return { label: 'Use this again', to: page }
  if (r.updateTo) return { label: 'Update', to: page }
  if (r.kind === 'agent') return 'createAgent'
  if (r.kind === 'team') return 'useTeam'
  if (r.kind === 'task-template') return { label: 'Add to a project', to: `${page}?add=project` }
  if (r.statuses.includes('noAgent')) return { label: 'Add to agents…', to: page }
  return null
}

/** The title's link, whose ::after covers the whole card, so the card is the tap target; the ⋯ menu comes after it, so it sits above it without a z-index that would put the next card over an open menu. */
const CARD_LINK = [
  'rounded-xl after:absolute after:inset-0 after:rounded-xl after:content-[\'\']',
  'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-accent',
].join(' ')

const TAG = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-medium'

/** One asset of the Library as a card: its kind's tile, name, who made it and its version, two lines on what it does, and a foot with the one tag that matters and who uses it. The whole card opens the asset; every action is in its ⋯ menu. */
export function LibraryAssetCard({ row, isAdmin, onCreateAgent, onExport, onRemove }: {
  row: Row
  isAdmin: boolean
  onCreateAgent: (assetId: string) => void
  onExport: (row: Row) => void
  onRemove: (row: Row) => void
}) {
  const navigate = useNavigate()
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
  const target = row.proposalId ? proposalPath(row, row.proposalId) : row.assetId ? libraryAssetPath(row.assetId) : null
  // A built-in has no Export or Remove; it still has the ⋯, which opens it and says why.
  if (row.builtIn && target) menu.push({ label: 'Open', hint: 'A built-in can’t be exported or removed', onSelect: () => navigate(target) })
  const tag = cardTag(row)
  const showStack = row.kind !== 'agent' && !row.proposalId && !row.statuses.includes('setAside')
  return (
    <div
      title={rowStateWords(row)} data-testid="library-card"
      className={`group relative flex min-h-36 flex-col gap-2 rounded-xl border bg-card p-3 ${target ? CARD_CLICKABLE_IN_GROUP : 'border-border'}`}
    >
      <div className="flex items-start gap-3">
        <KindTile kind={row.kind} name={row.title} />
        <div className="min-w-0 flex-1">
          {target
            ? <Link to={target} className={`${CARD_LINK} block truncate text-body font-medium text-text-primary`}>{row.title}</Link>
            : <span className="block truncate text-body font-medium text-text-primary">{row.title}</span>}
          <div className="truncate text-micro text-text-muted" data-testid="library-card-publisher">{cardPublisherWords(row)}</div>
        </div>
        {menu.length > 0 && <span className="relative shrink-0"><MoreMenu items={menu} label={`More about ${row.title}`} /></span>}
      </div>
      <p className="line-clamp-2 text-small text-text-secondary">{row.description}</p>
      <div className="mt-auto flex items-center gap-2 pt-1">
        {tag && (
          <span data-testid="library-card-tag" className={`${TAG} ${tag.needsYou ? 'border-border bg-chip text-text-primary' : 'border-border text-text-muted'}`}>
            {tag.lock && <Lock size={11} aria-hidden />}{tag.label}
          </span>
        )}
        <span className="flex-1" />
        {showStack && (
          <AgentStack
            everyAgent={row.builtIn ? !row.switchedOff : row.everyAgent} switchedOff={row.builtIn && row.switchedOff}
            agents={row.agentsUsing} total={row.agentsUsingCount}
          />
        )}
      </div>
    </div>
  )
}
