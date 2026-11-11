import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { findConversationFiles, useQuery } from 'wasp/client/operations'
import { pickerGroups, itemsOf } from './atQuery'
import type { AtPickerState } from './useAtPicker'

/** How long the typing rests before the site is asked. */
export const AT_PICKER_DEBOUNCE_MS = 150

function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

/** At most this share of what the screen shows, so on a phone the list fits above the keyboard. */
function maxHeight(): number {
  const shown = typeof window === 'undefined' ? 600 : (window.visualViewport?.height ?? window.innerHeight)
  return Math.max(120, Math.min(288, Math.round(shown * 0.4)))
}

/**
 * The `@` picker's list (spec part 3, *Chips in conversations*): the files of the conversation's place whose names
 * hold what was typed after the `@`, in groups with a heading, the folder beside each. Drawn only while open; the
 * field keeps the focus, and a click chooses without taking it.
 */
export function AtPicker({ conversationId, picker, left }: { conversationId: string; picker: AtPickerState; left: number }) {
  const fragment = useSettled(picker.fragment, AT_PICKER_DEBOUNCE_MS)
  const { data, isLoading, isFetching } = useQuery(findConversationFiles, { conversationId, fragment })
  const { groups } = useMemo(() => pickerGroups(data?.places ?? []), [data])
  const items = useMemo(() => itemsOf(groups), [groups])
  const { onItems } = picker
  useEffect(() => { onItems(items) }, [items, onItems])

  const waiting = isLoading || (isFetching && items.length === 0) || fragment !== picker.fragment
  let index = 0
  return (
    <div
      data-testid="at-picker"
      className="absolute bottom-full z-30 mb-2 w-80 max-w-full overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-pop"
      style={{ left, maxHeight: maxHeight() }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div id={picker.listId} role="listbox" aria-label="Files to mention">
        {groups.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`${picker.listId}-${group.id}`}>
            <p id={`${picker.listId}-${group.id}`} role="presentation" className="px-2 pb-1 pt-0.5 text-micro font-medium uppercase tracking-wide text-text-muted">
              {group.heading}
            </p>
            {group.items.map((item) => {
              const i = index++
              const on = i === picker.active
              return (
                <div
                  key={item.id}
                  id={picker.optionId(i)}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => picker.setActive(i)}
                  onClick={() => picker.choose(item)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${on ? 'bg-surface-hover' : ''}`}
                >
                  <FileText size={14} aria-hidden className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 truncate text-small text-text-primary">{item.label}</span>
                  <span className="ml-auto min-w-0 shrink truncate text-micro text-text-muted">{item.detail}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div role="status" aria-live="polite" className="text-small text-text-muted">
        {waiting && items.length === 0 && <p className="px-2 py-1.5">Finding files…</p>}
        {!waiting && items.length === 0 && (
          <p className="px-2 py-1.5">{picker.fragment ? `No files match “${picker.fragment}”` : 'No files here yet'}</p>
        )}
      </div>
    </div>
  )
}
