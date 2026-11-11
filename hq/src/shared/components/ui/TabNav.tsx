import type { ReactNode } from 'react'
import { SegmentedControl } from '@agenthix/ui/primitives'

export interface TabItem<T extends string> { value: T; label: string; icon?: ReactNode; count?: number }

interface TabNavProps<T extends string> { tabs: TabItem<T>[]; active: T; onChange: (tab: T) => void }

/** Views of one thing, as a segmented control drawn as tabs; a count follows its label. */
export function TabNav<T extends string>({ tabs, active, onChange }: TabNavProps<T>) {
  return (
    <SegmentedControl
      kind="tabs"
      label="View"
      value={active}
      onChange={onChange}
      className="self-start"
      options={tabs.map(t => ({
        value: t.value,
        icon: t.icon,
        label: t.count === undefined ? t.label : <>{t.label} <span className="text-micro font-normal text-text-muted">{t.count}</span></>,
      }))}
    />
  )
}
