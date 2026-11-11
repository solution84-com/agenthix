import { useState, type ReactNode } from 'react'
import { SCALE_LABEL, SHOW_LABEL, type TimelineScale, type TimelineShow } from './types'
import { MENU_ITEM, MENU_ITEM_CHOSEN, PLAIN_TRIGGER } from '../primitives/Menus'
import { BUTTON_SECONDARY } from '../primitives/buttonStyles'
import { CONTROL_HEIGHT, SEGMENT_CHOSEN, SEGMENT_PIECE, SEGMENT_PLAIN, SEGMENT_STRIP } from '../primitives/controlStyles'

const BUTTON = `rounded-lg px-2.5 py-1 text-small ${BUTTON_SECONDARY}`
// Show ▾ and Types ▾ are pickers in a toolbar: plain text.
const PICKER = `${CONTROL_HEIGHT} ${PLAIN_TRIGGER}`

function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" className={PICKER} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-40 rounded-xl border border-border bg-popover p-1 shadow-pop">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export interface TimelineToolbarProps {
  /** The dates in view, as words. */
  rangeText: string
  scale: TimelineScale
  show: TimelineShow
  onScale: (scale: TimelineScale) => void
  onShow: (show: TimelineShow) => void
  onStep: (direction: 1 | -1) => void
  onToday: () => void
  /** The project's task types, to choose which lanes show. */
  lanes?: { id: string; name: string }[]
  hiddenLaneIds?: ReadonlySet<string>
  onToggleLane?: (laneId: string) => void
}

/** Scale, back and forward, Today, Show ▾ and Types ▾ (spec §3). */
export function TimelineToolbar({ rangeText, scale, show, onScale, onShow, onStep, onToday, lanes, hiddenLaneIds, onToggleLane }: TimelineToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div role="group" aria-label="Scale" className={SEGMENT_STRIP}>
        {(Object.keys(SCALE_LABEL) as TimelineScale[]).map(s => (
          <button
            key={s} type="button" aria-pressed={s === scale} onClick={() => onScale(s)}
            className={`${SEGMENT_PIECE} ${s === scale ? SEGMENT_CHOSEN : SEGMENT_PLAIN}`}
          >
            {SCALE_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center gap-1">
        <button type="button" className={BUTTON} aria-label="Back" onClick={() => onStep(-1)}>‹</button>
        <button type="button" className={BUTTON} onClick={onToday}>Today</button>
        <button type="button" className={BUTTON} aria-label="Forward" onClick={() => onStep(1)}>›</button>
      </div>
      <span className="text-small text-text-secondary">{rangeText}</span>
      <div className="ml-auto flex gap-2">
        <Menu label={`Show: ${SHOW_LABEL[show]}`}>
          {close => (Object.keys(SHOW_LABEL) as TimelineShow[]).map(s => (
            <button
              key={s} type="button" role="menuitemradio" aria-checked={s === show}
              className={`flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-small ${s === show ? `${MENU_ITEM_CHOSEN}` : MENU_ITEM}`}
              onClick={() => { onShow(s); close() }}
            >
              <span>{SHOW_LABEL[s]}</span>
              <span aria-hidden className="w-3">{s === show ? '✓' : ''}</span>
            </button>
          ))}
        </Menu>
        {lanes && lanes.length > 1 && onToggleLane && (
          <Menu label="Types">
            {() => lanes.map(b => (
              <label key={b.id} className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-small ${MENU_ITEM}`}>
                <input type="checkbox" className="accent-accent" checked={!hiddenLaneIds?.has(b.id)} onChange={() => onToggleLane(b.id)} />
                {b.name}
              </label>
            ))}
          </Menu>
        )}
      </div>
    </div>
  )
}
