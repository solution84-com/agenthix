import type { ReactNode } from 'react'

export interface TabItem<T extends string> { value: T; label: string; icon?: ReactNode; count?: number }

interface TabNavProps<T extends string> { tabs: TabItem<T>[]; active: T; onChange: (tab: T) => void }

export function TabNav<T extends string>({ tabs, active, onChange }: TabNavProps<T>) {
  return (
    <div className="flex items-center border-b border-border">
      {tabs.map(tab => (
        <button
          key={tab.value}
          className={`flex items-center gap-1.5 px-4 py-2 text-small font-medium transition-all ${
            active === tab.value
              ? 'text-text-primary border-b-2 border-accent -mb-px'
              : 'text-text-muted hover:text-text-secondary'
          }`}
          onClick={() => onChange(tab.value)}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1 text-micro text-text-muted">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
