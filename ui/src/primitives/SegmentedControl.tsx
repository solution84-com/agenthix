import { useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { DISABLED, SEGMENT_CHOSEN, SEGMENT_PIECE, SEGMENT_PLAIN, SEGMENT_STRIP, withoutHover } from './controlStyles'
import { Tooltip } from './Tooltip'
import { useRefusal, type Refusal } from './useRefusal'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  /** Before the label. */
  icon?: ReactNode
  disabled?: boolean
  /** A tooltip saying more than the label. */
  title?: string
  /** This piece cannot be chosen now, for a reason known in advance: greyed, its reason in its tooltip, a press opens the dialog. */
  refusal?: Refusal
}

const NEXT: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * One choice from a small set (Task or Epic, Write or Preview, Fit or 100 %): one soft strip, the chosen piece raised
 * out of it, the others plain secondary text. `kind="radio"` (the default) for a value in a form, `"tabs"` for views of
 * one thing. One Tab stop, on the chosen piece; the arrow keys move the choice, Home and End go to the ends.
 * Disabled, the whole strip fades to 40 % and nothing answers. A piece with a `refusal` is greyed but still reached by
 * the arrow keys, which only move the focus onto it (its tooltip says why); a press opens the dialog.
 */
export function SegmentedControl<T extends string>({ label, labelledBy, options, value, onChange, kind = 'radio', disabled = false, className = '' }: {
  /** Its accessible name; or `labelledBy`, the id of a label on the page. */
  label?: string
  labelledBy?: string
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  kind?: 'radio' | 'tabs'
  disabled?: boolean
  className?: string
}) {
  const pieces = useRef<(HTMLButtonElement | null)[]>([])
  const open = options.map(o => !disabled && !o.disabled)
  const free = options.map((o, i) => open[i] && !o.refusal)
  const chosenAt = options.findIndex(o => o.value === value)
  const tabStop = chosenAt >= 0 && open[chosenAt] ? chosenAt : (free.includes(true) ? free.indexOf(true) : open.indexOf(true))

  const choose = (at: number) => {
    if (free[at]) onChange(options[at].value)
    pieces.current[at]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, from: number) => {
    if (!open.includes(true)) return
    let at = -1
    if (e.key === 'Home') at = open.indexOf(true)
    else if (e.key === 'End') at = open.lastIndexOf(true)
    else if (NEXT[e.key]) {
      at = from
      do at = (at + NEXT[e.key] + options.length) % options.length
      while (!open[at])
    }
    if (at < 0) return
    e.preventDefault()
    choose(at)
  }

  const tabs = kind === 'tabs'
  return (
    <div
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      className={`${SEGMENT_STRIP} ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      {options.map((o, i) => {
        const chosen = o.value === value
        return (
          <Piece
            key={o.value}
            option={o}
            pieceRef={el => { pieces.current[i] = el }}
            role={tabs ? 'tab' : 'radio'}
            chosen={chosen}
            tabStop={i === tabStop}
            disabled={!open[i]}
            faded={!!o.disabled && !disabled}
            onChoose={() => onChange(o.value)}
            onKeyDown={e => onKeyDown(e, i)}
          />
        )
      })}
    </div>
  )
}

function Piece<T extends string>({ option: o, pieceRef, role, chosen, tabStop, disabled, faded, onChoose, onKeyDown }: {
  option: SegmentOption<T>
  pieceRef: Ref<HTMLButtonElement>
  role: 'tab' | 'radio'
  chosen: boolean
  tabStop: boolean
  disabled: boolean
  faded: boolean
  onChoose: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const refused = useRefusal(disabled ? undefined : o.refusal)
  const look = `${SEGMENT_PIECE} ${chosen ? SEGMENT_CHOSEN : SEGMENT_PLAIN}`
  const piece = (
    <button
      ref={pieceRef}
      type="button"
      role={role}
      aria-checked={role === 'tab' ? undefined : chosen}
      aria-selected={role === 'tab' ? chosen : undefined}
      tabIndex={tabStop ? 0 : -1}
      disabled={disabled}
      title={refused.tooltip ? undefined : o.title}
      onClick={onChoose}
      onKeyDown={onKeyDown}
      {...refused.props}
      className={`${refused.tooltip ? `${withoutHover(look)} ${DISABLED}` : look} ${faded ? 'opacity-40' : ''}`}
    >
      {o.icon}
      {o.label}
    </button>
  )
  if (!refused.tooltip) return piece
  return <><Tooltip label={refused.tooltip} side="top" wrap>{piece}</Tooltip>{refused.dialog}</>
}
