import type { ShowAlsoOption } from './types'

/** What the Backlog's menu needs to offer "Show also": other boards' backlogs, never on by default. */
export interface ShowAlsoPicker {
  boardName: string
  options: ShowAlsoOption[]
  chosen: string[]
  onChange: (boardIds: string[]) => void
}

/** The boards whose backlogs this Backlog also shows, each under its own heading; this board's own is always shown. */
export function ShowAlsoChoices({ boardName, options, chosen, onChange }: ShowAlsoPicker) {
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id])
  return (
    <div role="group" aria-label="Show in this Backlog" className="p-2 text-small">
      <p className="px-1 pb-1 text-micro text-text-muted">Show in this Backlog</p>
      <label className="flex items-center gap-2 px-1 py-1 text-text-primary">
        <input type="checkbox" checked disabled readOnly aria-label={`${boardName}, always shown`} /> {boardName}
        <span className="ml-auto text-micro text-text-muted">always</span>
      </label>
      {options.map(o => (
        <label key={o.boardId} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-text-primary">
          <input type="checkbox" checked={chosen.includes(o.boardId)} onChange={() => toggle(o.boardId)} /> {o.name}
          <span className="ml-auto text-micro text-text-muted">{o.backlogCount}</span>
        </label>
      ))}
    </div>
  )
}
