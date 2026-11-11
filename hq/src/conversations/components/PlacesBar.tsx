import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, Plus, X } from 'lucide-react'
import { useQuery, getProject } from 'wasp/client/operations'
import { SPACE_PATH } from '../../chat/chatPlacePaths'
import { Button, MENU_ITEM, PlaceAvatar, FOCUS_RING, BUTTON_GHOST } from '@agenthix/ui/primitives'
import { addNotice, levelWords, placeKey, type ConversationPlacesView, type PlaceSummary } from './placesView'

type Props = {
  view: ConversationPlacesView
  agentName: string
  canChange: boolean
  busy: boolean
  onAdd: (place: PlaceSummary) => void | Promise<void>
  onRemove: (place: PlaceSummary) => void | Promise<void>
}

const CHIP = 'inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-chip px-2.5 py-0.5 text-small text-text-primary'

/** A place's name as a link that opens the place in the page: the person's space, or the project by its key. */
function PlaceName({ place, onOpen }: { place: PlaceSummary; onOpen: () => void }) {
  const project = place.kind === 'project'
  const { data } = useQuery(getProject, { projectId: project ? place.projectId : '' }, { enabled: project })
  const found = data as { key: string; personalSpace?: boolean } | undefined
  const href = !project ? SPACE_PATH : found ? (found.personalSpace ? SPACE_PATH : `/projects/${encodeURIComponent(found.key)}`) : null
  if (!href) return <span className="truncate">{place.name}</span>
  return <Link to={href} onClick={onOpen} data-testid="place-link" className={`rounded truncate hover:underline ${FOCUS_RING}`}>{place.name}</Link>
}

/** The places by name, with their ✕ and ＋ Add a place: the content of the ▾ popover, a sheet on a phone. */
function PlaceList({ view, agentName, canChange, busy, onAdd, onRemove, onOpen }: Props & { onOpen: () => void }) {
  const [adding, setAdding] = useState(false)
  const [chosen, setChosen] = useState<PlaceSummary | null>(null)
  const done = () => { setAdding(false); setChosen(null) }
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-lg:flex-col max-lg:items-stretch" data-testid="places-list">
      <span className={`${CHIP} max-lg:rounded-lg`} data-testid="place-own"><PlaceName place={view.own} onOpen={onOpen} /></span>
      {view.added.map((p) => (
        <span key={placeKey(p)} className={`${CHIP} max-lg:rounded-lg max-lg:justify-between`} data-testid="place-added" title={`Added by ${p.addedBy.name}`}>
          <PlaceName place={p} onOpen={onOpen} />
          {canChange && (
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              disabled={busy}
              onClick={() => void onRemove(p)}
              className="text-text-muted not-disabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 max-lg:flex max-lg:min-h-10 max-lg:min-w-10 max-lg:items-center max-lg:justify-center"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </span>
      ))}
      {canChange && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-small max-lg:min-h-10 ${BUTTON_GHOST}`}
        >
          <Plus size={12} aria-hidden />
          Add a place
        </button>
      )}
      {adding && (
        <div className="w-full rounded-xl border border-border bg-popover p-2 shadow-pop" data-testid="add-place-panel">
          {chosen ? (
            <div>
              <p className="text-small text-text-secondary" data-testid="add-place-notice">{addNotice(agentName, chosen.name)}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={async () => { await onAdd(chosen); done() }}>
                  Add {chosen.name}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={done}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="px-1 pb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Add a place to this conversation</p>
              {view.addable.length === 0 ? (
                <p className="px-1 py-1 text-small text-text-muted">There is no other place you can access to add.</p>
              ) : (
                <ul>
                  {view.addable.map((p) => (
                    <li key={placeKey(p)}>
                      <button
                        type="button"
                        onClick={() => setChosen(p)}
                        className={`${MENU_ITEM} items-baseline! justify-between gap-3`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-micro text-text-muted">{levelWords(p)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-1 pt-1 text-micro text-text-muted">Only places you can access are listed.</p>
              <button type="button" onClick={done} className="mt-1 px-1 text-small text-text-secondary hover:text-text-primary max-lg:min-h-10">Close</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const SHOWN = 2

/** A place as a tile: the person's own space by its name's first letter, a project by its id's colour. */
function Tile({ place }: { place: PlaceSummary }) {
  return <PlaceAvatar kind="project" id={place.kind === 'user' ? 'user' : place.projectId} name={place.name} size="sm" className="ring-2 ring-bg" />
}

/**
 * The places on the header's one line, as stacked tiles: where the conversation lives first, then what else it
 * reads, two shown and +N for the rest, each named when the pointer rests on it. ▾ opens them by name with
 * ＋ Add a place: a popover on a desktop, a sheet from the bottom on a phone.
 */
export function PlacesBar(props: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', away)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', away) }
  }, [open])
  const { view } = props
  const all: PlaceSummary[] = [view.own, ...view.added]
  const shown = all.slice(0, SHOWN)
  const more = all.length - shown.length
  const names = all.map((p) => p.name).join(', ')
  return (
    <div ref={root} className="relative" data-testid="conversation-places">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Places: ${names}`}
        data-testid="places-tiles"
        className={`inline-flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING} max-lg:min-h-10`}
      >
        <span className="flex -space-x-1.5">
          {shown.map((p) => (
            <span key={placeKey(p)} title={p.name} data-testid="place-tile" className="inline-flex"><Tile place={p} /></span>
          ))}
        </span>
        {more > 0 && <span data-testid="places-more" title={all.slice(SHOWN).map((p) => p.name).join(', ')} className="text-micro text-text-muted">+{more}</span>}
        <ChevronDown size={12} aria-hidden className="text-text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-scrim lg:hidden" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Places"
            data-testid="places-popover"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-border bg-popover p-4 shadow-pop lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-full lg:mt-1 lg:w-80 lg:max-w-[90vw] lg:rounded-xl lg:p-3"
          >
            <p className="pb-2 text-micro font-medium uppercase tracking-wide text-text-muted">Places this conversation reads</p>
            <PlaceList {...props} onOpen={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
