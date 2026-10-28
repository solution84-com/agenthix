import { useCallback, useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react'
import type { MessageFieldHandle } from '../MessageField'
import { atQueryAt, type AtQuery, type PickerItem } from './atQuery'

/**
 * The `@` picker's state in the message box: open while the caret ends an `@…` and Escape hasn't closed it, the item
 * the keys are on, and what choosing does. The field keeps the focus throughout; the keys reach the picker through it.
 * The `/` skill picker is the same with its own trigger (`queryAt`) and its own choice (`onChoose`).
 */
export function useAtPicker({ enabled, field, queryAt = atQueryAt, onChoose }: {
  enabled: boolean
  /** The message field, which the default choice writes its chip into; not needed with `onChoose`. */
  field?: RefObject<MessageFieldHandle | null>
  queryAt?: (text: string, caret: number | null) => AtQuery | null
  /** What choosing does; by default the item's reference replaces the typed text as a chip. */
  onChoose?: (item: PickerItem, query: AtQuery) => void
}) {
  const listId = useId()
  const [at, setAt] = useState<{ text: string; caret: number | null }>({ text: '', caret: null })
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [items, setItems] = useState<PickerItem[]>([])
  const [active, setActive] = useState(0)

  const query = enabled ? queryAt(at.text, at.caret) : null
  const open = query !== null && query.start !== dismissed

  useEffect(() => { setActive(0) }, [query?.start, query?.fragment])
  useEffect(() => { if (!open) setItems([]) }, [open])
  // Escape closes the picker for that `@` only: one typed elsewhere, or the same one typed again, opens it.
  useEffect(() => { if (dismissed !== null && query?.start !== dismissed) setDismissed(null) }, [query?.start, dismissed])

  const onCaret = useCallback((text: string, caret: number | null) => setAt({ text, caret }), [])

  const choose = (item: PickerItem) => {
    if (!query) return
    if (onChoose) onChoose(item, query)
    else field?.current?.mentionAt(query.start, query.end, item.reference)
  }

  const onKeyFirst = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (!open || !query) return false
    const n = items.length
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (n === 0) return false
        e.preventDefault()
        setActive(a => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n))
        return true
      case 'Enter':
      case 'Tab': {
        const item = items[Math.min(active, n - 1)]
        if (!item || e.shiftKey) return false
        e.preventDefault()
        choose(item)
        return true
      }
      case 'Escape':
        e.preventDefault()
        setDismissed(query.start)
        return true
      default:
        return false
    }
  }

  const optionId = (i: number) => `${listId}-option-${i}`
  return {
    open,
    fragment: query?.fragment ?? '',
    listId,
    active: Math.min(active, Math.max(items.length - 1, 0)),
    optionId,
    activeId: open && items.length > 0 ? optionId(Math.min(active, items.length - 1)) : undefined,
    onCaret,
    onKeyFirst,
    onItems: setItems,
    setActive,
    choose,
  }
}

export type AtPickerState = ReturnType<typeof useAtPicker>
