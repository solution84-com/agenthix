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
      <div role="group" aria-label="Preset" className="mt-2 flex flex-wrap gap-1.5">
        {presets.map(p => {
          // Custom is a state, not something to pick.
          const pickable = !readOnly && p.id !== 'custom'
          return (
            <button
              key={p.id} type="button" aria-pressed={selected === p.id} disabled={!pickable} onClick={() => onPick(p.id)}
              className={`rounded-full border px-3 py-1 text-small transition-colors disabled:cursor-default ${selected === p.id ? 'border-accent bg-accent-subtle text-accent' : 'border-border-subtle bg-surface-1 text-text-secondary enabled:hover:bg-surface-hover'}`}
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
