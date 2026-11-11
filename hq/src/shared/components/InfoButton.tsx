import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'

/**
 * The (i) beside a setting's name: a button that opens the setting's explanation under it, the same in every state.
 * Click, tap, Enter or Space opens and closes it; Escape closes it and gives focus back; a click elsewhere closes it.
 */
export function InfoButton({ label, children }: {
  /** The button's accessible name and the explanation's, such as "About Adaptive voice". */
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex size-4 items-center justify-center rounded-full border border-border text-micro font-medium italic text-text-muted transition-colors hover:border-border-strong hover:text-text-primary active:bg-surface-pressed ${FOCUS_RING} max-lg:size-5`}
      >
        i
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-border bg-popover p-3 text-small font-normal text-text-primary shadow-pop"
        >
          {children}
        </div>
      )}
    </span>
  )
}
