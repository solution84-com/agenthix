/** The picker's small pieces: a section heading, a part's chip, a cell of a grid, and a row of colour swatches. */
import { useEffect, useRef, type ReactNode } from 'react'
import { CARD_CHOSEN, FOCUS_RING, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'

export function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-micro font-medium uppercase tracking-wide text-text-muted first:mt-0">{children}</h3>
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className={`rounded-full border border-border px-2.5 py-0.5 text-small ${on ? ROW_CHOSEN : ROW_ITEM} ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

/** One choice drawn as a picture: a robot, a part's option, a pattern. */
export function Cell({ on, label, onClick, wide = false, children }: { on: boolean; label: string; onClick: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={on} aria-label={label} title={label} onClick={onClick}
      className={`relative overflow-hidden rounded-lg border border-border bg-surface-2 ${wide ? 'aspect-[3/1]' : 'aspect-square'} ${on ? CARD_CHOSEN : 'hover:border-border-strong'} ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

export function CellGrid({ wide = false, tall = false, children }: { wide?: boolean; tall?: boolean; children: ReactNode }) {
  const columns = wide ? 'grid-cols-[repeat(auto-fill,minmax(96px,1fr))]' : tall ? 'grid-cols-[repeat(auto-fill,minmax(60px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(48px,1fr))]'
  const ref = useRef<HTMLDivElement>(null)
  // A long grid opens on the current choice, not on its first row.
  useEffect(() => {
    const grid = ref.current
    const on = grid?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (grid && on && grid.scrollHeight > grid.clientHeight) grid.scrollTop = on.offsetTop - grid.clientHeight / 2 + on.offsetHeight / 2
  }, [])
  return <div ref={ref} className={`relative grid gap-1.5 p-0.5 ${columns} ${wide ? '' : 'max-h-56 overflow-y-auto'}`}>{children}</div>
}

/** A row of colours from the palette; `fill` is the swatch's own colour, as the picture will draw it. */
export function Swatches({ label, names, chosen, fill, onChoose }: {
  label: string
  names: readonly string[]
  chosen: string | null
  fill: (name: string) => string
  onChoose: (name: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {names.map(name => (
        <button
          key={name} type="button" role="radio" aria-checked={name === chosen} aria-label={name.replace(/-/g, ' ')} title={name.replace(/-/g, ' ')}
          onClick={() => onChoose(name)}
          className={`h-6 w-6 rounded-full border border-border ${name === chosen ? 'outline-2 outline-offset-2 outline-solid outline-text-primary' : ''} ${FOCUS_RING}`}
          style={{ background: fill(name) }}
        />
      ))}
    </div>
  )
}

const PART_LABEL: Record<string, string> = {
  facialHair: 'Facial hair', brows: 'Eyebrows', lips: 'Mouth', bodyIcon: 'Badge', gesture: 'Hands',
  hairColor: 'Hair colour', headContrastColor: 'Hair colour', skinColor: 'Skin', shapeColor: 'Colour',
  clothingColor: 'Clothing', ringColor: 'Rings', rowColor: 'Colour',
  shape1Color: 'First shape', shape2Color: 'Second shape', shape3Color: 'Third shape',
}

/** A style's option name as the picker says it: `facialHair` is "Facial hair". */
export function partLabel(key: string): string {
  return PART_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase()
}
