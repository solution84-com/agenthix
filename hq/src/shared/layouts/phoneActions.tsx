import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** One of a screen's actions, in the phone top bar's ⋯. */
export interface PhoneAction {
  label: string
  onSelect: () => void
  /** A short line under the label. */
  hint?: string
  danger?: boolean
  /** Known in advance not to work: the row is greyed, and this says why. */
  disabledWhy?: string
}

interface PhoneActionsSlot {
  set: (id: string, actions: PhoneAction[] | null) => void
}

/** Lines ticked on the screen (spec, *The phone*): the top bar becomes ✕ · "N selected" · ⋯ with their actions. */
export interface PhoneSelection {
  count: number
  /** What the lines are in, under the count ("Website relaunch · Tasks"). */
  under?: string
  onCancel: () => void
  actions: PhoneAction[]
}

const SlotContext = createContext<PhoneActionsSlot | null>(null)
const ActionsContext = createContext<PhoneAction[]>([])
const SelectionSlotContext = createContext<((s: PhoneSelection | null) => void) | null>(null)
const SelectionContext = createContext<PhoneSelection | null>(null)

/**
 * Held by the shell's frame: the actions the screen on show has put in the top bar's ⋯. When more than one view
 * publishes (a section and a view opened inside it), the one that published last is shown.
 */
export function PhoneActionsProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] = useState<{ id: string; actions: PhoneAction[] }[]>([])
  const set = useCallback((id: string, actions: PhoneAction[] | null) => {
    setPublished((prev) => {
      const rest = prev.filter((p) => p.id !== id)
      return actions?.length ? [...rest, { id, actions }] : rest.length === prev.length ? prev : rest
    })
  }, [])
  const slot = useMemo(() => ({ set }), [set])
  const actions = published.length ? published[published.length - 1].actions : NONE
  const [selection, setSelection] = useState<PhoneSelection | null>(null)
  return (
    <SlotContext.Provider value={slot}>
      <SelectionSlotContext.Provider value={setSelection}>
        <ActionsContext.Provider value={actions}>
          <SelectionContext.Provider value={selection}>{children}</SelectionContext.Provider>
        </ActionsContext.Provider>
      </SelectionSlotContext.Provider>
    </SlotContext.Provider>
  )
}

const NONE: PhoneAction[] = []

/**
 * Puts the screen's actions behind the phone top bar's ⋯ while the screen is shown, the main one first (spec, *The
 * phone*): there is no row of actions under the top bar. On a wide screen the screen draws them itself. False where no
 * shell frames the screen.
 */
export function usePhoneActions(actions: PhoneAction[] | null | undefined): boolean {
  const slot = useContext(SlotContext)
  const id = useId()
  const latest = useRef(actions)
  latest.current = actions
  // Republished only when what the rows say changes; a choice always calls the screen's latest handler.
  const key = JSON.stringify((actions ?? []).map(({ label, hint, danger, disabledWhy }) => [label, hint, danger, disabledWhy]))
  useLayoutEffect(() => {
    if (!slot) return
    const rows: PhoneAction[] = (JSON.parse(key) as [string, string | null, boolean | null, string | null][]).map(([label, hint, danger, disabledWhy], i) => ({
      label, hint: hint ?? undefined, danger: danger ?? undefined, disabledWhy: disabledWhy ?? undefined,
      onSelect: () => latest.current?.[i]?.onSelect(),
    }))
    slot.set(id, rows)
    return () => slot.set(id, null)
  }, [slot, id, key])
  return !!slot
}

export function usePublishedPhoneActions(): PhoneAction[] {
  return useContext(ActionsContext)
}

/**
 * While lines are ticked (`selection` given), the phone top bar shows the selection in place of the screen's title:
 * ✕ leaves it, the title says how many, and the ⋯ holds what can be done with them; the chat steps aside. False where
 * no shell frames the screen.
 */
export function usePhoneSelection(selection: PhoneSelection | null): boolean {
  const set = useContext(SelectionSlotContext)
  const latest = useRef(selection)
  latest.current = selection
  const key = selection
    ? JSON.stringify([selection.count, selection.under, selection.actions.map(({ label, hint, danger, disabledWhy }) => [label, hint, danger, disabledWhy])])
    : null
  useLayoutEffect(() => {
    if (!set) return
    if (key === null) { set(null); return }
    const s = latest.current!
    set({
      count: s.count, under: s.under,
      onCancel: () => latest.current?.onCancel(),
      actions: s.actions.map((a, i) => ({ ...a, onSelect: () => latest.current?.actions[i]?.onSelect() })),
    })
    return () => set(null)
  }, [set, key])
  return !!set
}

export function usePublishedPhoneSelection(): PhoneSelection | null {
  return useContext(SelectionContext)
}
