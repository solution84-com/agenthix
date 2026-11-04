import { useState } from 'react'
import { useQuery, useAction, getUserSettings, setMyTimezone } from 'wasp/client/operations'

const USE_BROWSER = ''

/** Every zone the browser knows, with the stored one added if the browser's list lacks it. */
function zoneOptions(stored: string | null): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const all = known.includes('UTC') ? known : ['UTC', ...known]
  return stored && !all.includes(stored) ? [stored, ...all] : all
}

/**
 * The time zone agents read a person's times in (when an agent sets "tomorrow at
 * 9" for them). It follows the browser until the person picks one here; choosing
 * "Use my browser's time zone" hands it back.
 */
export function TimezoneSection() {
  const { data: settings } = useQuery(getUserSettings)
  const save = useAction(setMyTimezone)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const stored: string | null = settings?.timezone ?? null
  const chosen = settings?.timezoneChosen === true
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone

  async function change(value: string) {
    setProblem(null)
    setSaved(false)
    try {
      await save({ timezone: value === USE_BROWSER ? null : value })
      setSaved(true)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <label className="block text-small text-text-secondary mb-1" htmlFor="timezone">Your time zone</label>
      <select
        id="timezone"
        value={chosen && stored ? stored : USE_BROWSER}
        onChange={e => void change(e.target.value)}
        className="appearance-none bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent/50"
      >
        <option value={USE_BROWSER}>Use my browser's time zone ({browser})</option>
        {zoneOptions(chosen ? stored : null).map(zone => <option key={zone} value={zone}>{zone}</option>)}
      </select>
      <p className="text-small text-text-muted mt-2">
        The time zone agents use when you ask them for a time, such as "start it tomorrow at 9". It follows this
        browser unless you choose one.
      </p>
      {!chosen && stored && <p className="text-small text-text-muted mt-1">Currently {stored}, from this browser.</p>}
      {saved && <p className="text-small text-success mt-2">Saved.</p>}
      {problem && <p className="text-small text-danger mt-2">{problem}</p>}
    </div>
  )
}
