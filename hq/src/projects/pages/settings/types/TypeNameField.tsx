import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { CONTROL_HEIGHT, FIELD, MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from '@agenthix/ui/primitives'
import { TASK_TYPE_ICON_NAMES, TaskTypeMark } from '@agenthix/ui/tasks'
import { EPIC_TYPE_ICON, TASK_TYPE_NAME_MAX_LENGTH } from '@agenthix/core'
import { INPUT } from '../Part'

const ICON_WORDS: Record<string, string> = { task: 'Clipboard', bug: 'Bug', feature: 'Light bulb', support: 'Lifebuoy' }

/** A type's mark: the icons a type can be given (the epic's diamond is Epic's own). */
function MarkPicker({ name, icon, onChange, disabled }: { name: string; icon: string; onChange: (icon: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const icons = TASK_TYPE_ICON_NAMES.filter(i => i !== EPIC_TYPE_ICON || icon === EPIC_TYPE_ICON)
  return (
    <div className="relative shrink-0">
      <button
        type="button" aria-label="Its mark" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}
        className={`${CONTROL_HEIGHT} inline-flex items-center gap-1 rounded-lg px-2 text-text-secondary ${FIELD} ${OPENS_MENU}`}
      >
        <TaskTypeMark type={{ name, icon }} size={14} />
        <ChevronDown size={14} aria-hidden className="text-text-muted" />
      </button>
      {open && (
        <PopSheet label="Its mark" align="left" width="sm:w-56" onClose={() => setOpen(false)}>
          <MenuHeading label="Its mark" />
          {icons.map(i => (
            <button key={i} type="button" role="menuitemradio" aria-checked={i === icon} className={`${MENU_ITEM} items-center`} onClick={() => { onChange(i); setOpen(false) }}>
              <TaskTypeMark type={{ name: ICON_WORDS[i] ?? name, icon: i }} variant="tile" />
              <span className={i === icon ? 'font-medium' : ''}>{ICON_WORDS[i] ?? name}</span>
            </button>
          ))}
        </PopSheet>
      )}
    </div>
  )
}

/** A type's name with its mark beside it, as New task type and a type's columns page draw them. */
export function TypeNameField({ name, icon, onName, onIcon, disabled, hint }: {
  name: string
  icon: string
  onName: (name: string) => void
  onIcon: (icon: string) => void
  disabled?: boolean
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="max-w-[420px]">
      <label htmlFor={id} className="mb-1.5 block text-small text-text-secondary">Name</label>
      <div className="flex gap-2">
        <MarkPicker name={name || 'Type'} icon={icon} onChange={onIcon} disabled={disabled} />
        <input
          id={id} value={name} disabled={disabled} maxLength={TASK_TYPE_NAME_MAX_LENGTH} onChange={e => onName(e.target.value)}
          className={`${INPUT} ${CONTROL_HEIGHT} py-0`}
        />
      </div>
      {hint && <p className="mt-1.5 text-micro text-text-muted">{hint}</p>}
    </div>
  )
}
