import { useSearchParams } from 'react-router'

export const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'types', label: 'Task types' },
  { id: 'fields', label: 'Custom fields' },
  { id: 'runs', label: 'Runs and finished tasks' },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id']

const isTab = (v: string | null): v is SettingsTab => SETTINGS_TABS.some(t => t.id === v)

/** The open tab, kept in the address (`?tab=types`) so a link and Back reach it; General when none is named. */
export function useSettingsTab(): [SettingsTab, (tab: SettingsTab) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: SettingsTab = isTab(raw) ? raw : 'general'
  const choose = (next: SettingsTab) => setParams(p => {
    const out = new URLSearchParams(p)
    if (next === 'general') out.delete('tab')
    else out.set('tab', next)
    return out
  }, { replace: true })
  return [tab, choose]
}

/** Where a sub-page of Settings goes back to: the project with Settings open on the tab. */
export const settingsTabHref = (projectKey: string, tab: SettingsTab) =>
  `/projects/${encodeURIComponent(projectKey)}?tool=settings${tab === 'general' ? '' : `&tab=${tab}`}`

/** Settings' tabs, drawn as a task's page draws its own: a line under the open one. Scrolls sideways on a phone. */
export function SettingsTabs({ tab, onChange }: { tab: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  return (
    <div role="tablist" aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-border-subtle">
      {SETTINGS_TABS.map(t => (
        <button
          key={t.id} type="button" role="tab" id={`settings-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="settings-tabpanel"
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-small max-lg:min-h-11 ${tab === t.id ? 'border-accent font-semibold text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
