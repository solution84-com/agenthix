import { useEffect, useRef, useState } from 'react'
import { MapPin, Plus, X } from 'lucide-react'
import { addNotice, levelWords, placeCount, placeKey, type ConversationPlacesView, type PlaceSummary } from './placesView'

type Props = {
  view: ConversationPlacesView
  agentName: string
  canChange: boolean
  busy: boolean
  onAdd: (place: PlaceSummary) => void | Promise<void>
  onRemove: (place: PlaceSummary) => void | Promise<void>
}

const CHIP = 'inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-chip px-2.5 py-0.5 text-small text-text-primary'

/** The list of places, with their ✕ and Add place…; on a desktop it sits in the header, on a phone it is the sheet's content. */
function PlaceList({ view, agentName, canChange, busy, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false)
  const [chosen, setChosen] = useState<PlaceSummary | null>(null)
  const done = () => { setAdding(false); setChosen(null) }
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-lg:flex-col max-lg:items-stretch" data-testid="places-list">
      <span className={`${CHIP} max-lg:rounded-lg`} data-testid="place-own">{view.own.name}</span>
      {view.added.map((p) => (
        <span key={placeKey(p)} className={`${CHIP} max-lg:rounded-lg max-lg:justify-between`} data-testid="place-added" title={`Added by ${p.addedBy.name}`}>
          <span className="truncate">{p.name}</span>
          {canChange && (
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              disabled={busy}
              onClick={() => void onRemove(p)}
              className="text-text-muted hover:text-danger disabled:opacity-50 max-lg:flex max-lg:min-h-10 max-lg:min-w-10 max-lg:items-center max-lg:justify-center"
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
          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-small text-text-muted hover:bg-surface-hover hover:text-text-primary max-lg:min-h-10"
        >
          <Plus size={12} aria-hidden />
          Add place…
        </button>
      )}
      {adding && (
        <div className="w-full rounded-lg border border-border bg-surface-1 p-2 shadow-pop" data-testid="add-place-panel">
          {chosen ? (
            <div>
              <p className="text-small text-text-secondary" data-testid="add-place-notice">{addNotice(agentName, chosen.name)}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => { await onAdd(chosen); done() }}
                  className="rounded-lg bg-accent px-3 py-1 text-small font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50 max-lg:min-h-10"
                >
                  Add {chosen.name}
                </button>
                <button type="button" onClick={done} className="rounded-lg px-3 py-1 text-small text-text-secondary hover:text-text-primary max-lg:min-h-10">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className="px-1 pb-1 text-micro font-semibold uppercase tracking-wide text-text-muted">Add a place to this conversation</p>
              {view.addable.length === 0 ? (
                <p className="px-1 py-1 text-small text-text-muted">There is no other place you can access to add.</p>
              ) : (
                <ul>
                  {view.addable.map((p) => (
                    <li key={placeKey(p)}>
                      <button
                        type="button"
                        onClick={() => setChosen(p)}
                        className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-small hover:bg-surface-hover max-lg:min-h-10"
                      >
                        <span className="truncate text-text-primary">{p.name}</span>
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

/**
 * "Places: Your space · Website rebuild ✕ · + Add place…" in the header. On a phone it reads "2 places" and a tap
 * opens the list as a sheet from the bottom.
 */
export function PlacesBar(props: Props) {
  const [sheet, setSheet] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheet])
  return (
    <div data-testid="conversation-places">
      <div className="hidden items-start gap-2 lg:flex">
        <span className="shrink-0 pt-0.5 text-small text-text-muted">Places:</span>
        <div className="min-w-0 flex-1"><PlaceList {...props} /></div>
      </div>
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-small text-text-muted hover:text-text-primary max-lg:min-h-10"
        >
          <MapPin size={14} aria-hidden />
          {placeCount(props.view)}
        </button>
        {sheet && (
          <>
            <div className="fixed inset-0 z-40 bg-scrim" aria-hidden onClick={() => setSheet(false)} />
            <div
              ref={sheetRef}
              role="dialog"
              aria-label="Places"
              data-testid="places-sheet"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-border bg-surface-1 p-4 shadow-pop"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-body font-medium text-text-primary">Places</h2>
                <button type="button" onClick={() => setSheet(false)} className="text-small text-text-secondary hover:text-text-primary max-lg:min-h-10">Done</button>
              </div>
              <PlaceList {...props} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
