import { SEGMENT_CHOSEN, SEGMENT_PIECE, SEGMENT_PLAIN, SEGMENT_STRIP } from '../../primitives/controlStyles'

/** "Start from a preset": chips, the one that matches selected, Custom once a tool has been changed, and what the selected one grants. */
export function PresetChips({ presets, selected, readOnly, onPick }: {
  presets: { id: string; label: string; description?: string }[]
  selected: string
  readOnly: boolean
  onPick: (id: string) => void
}) {
  const description = presets.find(p => p.id === selected)?.description
  return (
    <div>
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted">Start from a preset</p>
      <div role="group" aria-label="Preset" className={`mt-2 flex-wrap ${SEGMENT_STRIP} h-auto! max-sm:h-auto!`}>
        {presets.map(p => {
          // Custom is a state, not something to pick.
          const pickable = !readOnly && p.id !== 'custom'
          return (
            <button
              key={p.id} type="button" aria-pressed={selected === p.id} disabled={!pickable} onClick={() => onPick(p.id)}
              className={`${SEGMENT_PIECE} py-1 ${selected === p.id ? SEGMENT_CHOSEN : SEGMENT_PLAIN}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {description && <p className="mt-2 text-small text-text-secondary">{description}</p>}
    </div>
  )
}
