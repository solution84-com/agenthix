/** The right column's two tabs, Log and Settings: the last one is remembered for this browser, and both stay mounted so the Lab and the Log keep what they have seen. */
import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react'

const KEY = 'voice-playground.tab'
export type PlaygroundTab = 'log' | 'settings'
const TABS: { id: PlaygroundTab; label: string }[] = [{ id: 'log', label: 'Log' }, { id: 'settings', label: 'Settings' }]

function savedTab(): PlaygroundTab {
  try { return localStorage.getItem(KEY) === 'settings' ? 'settings' : 'log' } catch { return 'log' }
}

export function useTab(): [PlaygroundTab, (tab: PlaygroundTab) => void] {
  const [tab, setTab] = useState<PlaygroundTab>(savedTab)
  const choose = useCallback((next: PlaygroundTab) => {
    setTab(next)
    try { localStorage.setItem(KEY, next) } catch { /* not kept */ }
  }, [])
  return [tab, choose]
}

/** `logTools` sits at the end of the tab bar while the Log is open (the key to its badges), so it takes no row of its own. */
export function PlaygroundTabs({ log, settings, logTools }: { log: ReactNode; settings: ReactNode; logTools?: ReactNode }) {
  const [tab, choose] = useTab()
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = TABS[(TABS.findIndex(t => t.id === tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id
    choose(next)
    document.getElementById(`playground-tab-${next}`)?.focus()
  }
  return (
    <>
      <div role="tablist" aria-label="Log and settings" className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5">
        {TABS.map(t => (
          <button
            key={t.id} id={`playground-tab-${t.id}`} type="button" role="tab" data-testid={`playground-tab-${t.id}`}
            aria-selected={tab === t.id} aria-controls={`playground-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => choose(t.id)} onKeyDown={onKey}
            className={`rounded-button px-3 py-1 text-small font-medium max-sm:min-h-11 ${tab === t.id ? 'bg-selected text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'}`}
          >
            {t.label}
          </button>
        ))}
        {tab === 'log' && logTools && <div className="ml-auto flex items-center">{logTools}</div>}
      </div>
      {TABS.map(t => (
        <div
          key={t.id} id={`playground-panel-${t.id}`} role="tabpanel" aria-label={t.label} aria-labelledby={`playground-tab-${t.id}`}
          hidden={tab !== t.id} className="flex min-h-0 flex-1 flex-col"
        >
          {t.id === 'log' ? log : settings}
        </div>
      ))}
    </>
  )
}
