import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { FOCUS_RING } from '../primitives/controlStyles'

/** How long a toast stays when nobody holds it. */
export const TOAST_MS = 4000

type Shown = { id: number; words: string }

let shown: Shown | null = null
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

/** Says a few words in the toast; a toast already showing gives way to it. */
export function toast(words: string): void {
  shown = { id: nextId++, words }
  emit()
}

function dismiss(id: number) {
  if (shown?.id !== id) return
  shown = null
  emit()
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const current = () => shown

/**
 * `toast(words)`, for a press that worked whose result the screen does not show ("Copied", "Invitation sent"). Never an
 * error and never anything to act on: a toast has no buttons. `ToastHost`, drawn once by the frame, shows it.
 */
export function useToast(): (words: string) => void {
  return toast
}

/**
 * Where the toast shows, drawn once by the frame: at the bottom centre, `offset` above the bottom of the window so it
 * sits above anything there and never over a control or an open dialog (it sits just below the modal layer; hq lifts it above the message box). A frame can also set the
 * CSS variable `--toast-offset`, and `--toast-left` / `--toast-right` (the distance from each side of the window) to
 * centre it over one column, such as the docked conversation, instead of the whole window. One at a time; it goes by itself after about four seconds, and waits while hovered
 * or focused.
 */
export function ToastHost({ offset }: { offset?: string }) {
  const now = useSyncExternalStore(subscribe, current, current)
  const held = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = now?.id

  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const start = () => {
    stop()
    if (id !== undefined && !held.current) timer.current = setTimeout(() => dismiss(id), TOAST_MS)
  }
  useEffect(() => { held.current = false; start(); return stop }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hold = () => { held.current = true; stop() }
  const release = () => { held.current = false; start() }
  const style = { ...(offset ? { '--toast-offset': offset } : {}), bottom: 'calc(var(--toast-offset, 0px) + 1.5rem)', left: 'var(--toast-left, 0px)', right: 'var(--toast-right, 0px)' } as CSSProperties
  return (
    <div
      role="status" aria-live="polite" data-toast-host style={style}
      className="pointer-events-none fixed z-[45] flex justify-center px-4"
    >
      {now && (
        <div
          key={now.id} tabIndex={0} data-testid="toast"
          onMouseEnter={hold} onMouseLeave={release} onFocus={hold} onBlur={release}
          className={`pointer-events-auto max-w-sm rounded-lg bg-text-primary px-3 py-2 text-small text-surface-1 shadow-pop ${FOCUS_RING}`}
        >
          {now.words}
        </div>
      )}
    </div>
  )
}
