import { useEffect, useMemo } from 'react'
import { Zap } from 'lucide-react'
import { listConversationSkills, listStartSkills, useQuery } from 'wasp/client/operations'
import type { ListStartSkillsArgs } from '../../listConversationSkills'
import { skillGroups, skillItems, type SkillRow } from './slashQuery'
import type { SkillPickerState } from './useSkillPicker'

/** At most this share of what the screen shows, so on a phone the list fits above the keyboard. */
function maxHeight(): number {
  const shown = typeof window === 'undefined' ? 600 : (window.visualViewport?.height ?? window.innerHeight)
  return Math.max(120, Math.min(288, Math.round(shown * 0.4)))
}

type Listed = { data?: { skills: unknown[] }; isLoading: boolean; error: Error | null | undefined }

/** The `/` picker for a conversation: the skills its agent has. */
export function SkillPicker({ conversationId, picker, left }: { conversationId: string; picker: SkillPickerState; left: number }) {
  return <SkillList listed={useQuery(listConversationSkills, { conversationId })} picker={picker} left={left} />
}

/** The `/` picker in a box that starts a conversation: the skills the chosen agent has in the place it will start in. */
export function StartSkillPicker({ start, picker, left }: { start: ListStartSkillsArgs; picker: SkillPickerState; left: number }) {
  return <SkillList listed={useQuery(listStartSkills, start)} picker={picker} left={left} />
}

/**
 * The `/` picker's list: the skills, in groups by where each comes from, narrowed in the browser on what was typed
 * after the `/`. Hq answers from its records, so nothing waits on a site. Drawn only while open; the field keeps the
 * focus, and a click chooses without taking it.
 */
function SkillList({ listed, picker, left }: { listed: Listed; picker: SkillPickerState; left: number }) {
  const { data, isLoading, error } = listed
  const rows = (data?.skills ?? []) as SkillRow[]
  const groups = useMemo(() => skillGroups(rows, picker.fragment), [data, picker.fragment])
  const items = useMemo(() => skillItems(groups), [groups])
  const { onItems } = picker
  useEffect(() => { onItems(items) }, [items, onItems])

  let index = 0
  return (
    <div
      data-testid="skill-picker"
      className="absolute bottom-full z-30 mb-2 w-96 max-w-full overflow-y-auto rounded-xl border border-border bg-surface-1 p-1.5 shadow-pop"
      style={{ left, maxHeight: maxHeight() }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div id={picker.listId} role="listbox" aria-label="Skills">
        {groups.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`${picker.listId}-${group.id}`}>
            <p id={`${picker.listId}-${group.id}`} role="presentation" className="px-2 pb-1 pt-0.5 text-micro font-semibold uppercase tracking-wide text-text-muted">
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
                  <Zap size={14} aria-hidden className="shrink-0 text-text-secondary" />
                  <span className="shrink-0 text-small font-medium text-text-primary">{item.label}</span>
                  <span className="min-w-0 truncate text-micro text-text-muted">{item.detail}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div role="status" aria-live="polite" className="text-small text-text-muted">
        {isLoading && items.length === 0 && <p className="px-2 py-1.5">Finding skills…</p>}
        {error && <p className="px-2 py-1.5">The skills could not be listed: {error.message}</p>}
        {!isLoading && !error && items.length === 0 && (
          <p className="px-2 py-1.5">{picker.fragment ? `No skill matches “${picker.fragment}”` : 'This agent has no skills here yet'}</p>
        )}
      </div>
    </div>
  )
}
