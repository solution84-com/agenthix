import { useState } from 'react'
import { useAction, setOrganisationTimeZone } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'

function zoneOptions(stored: string): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const all = known.includes('UTC') ? known : ['UTC', ...known]
  return all.includes(stored) ? all : [stored, ...all]
}

/** The time zone a month is cut in, shown beside the report and changed here. The report is read again after. */
export function TimeZoneControl({ timeZone, onChanged }: { timeZone: string; onChanged: () => void }) {
  const save = useAction(setOrganisationTimeZone)
  const [problem, setProblem] = useState('')
  const change = async (next: string) => {
    setProblem('')
    try { await save({ timeZone: next }); onChanged() } catch (err) { setProblem(err instanceof Error ? err.message : 'Could not change the time zone') }
  }
  return (
    <div className="mt-3">
      <label htmlFor="usage-zone" className="text-small text-text-secondary">A month is cut in the organisation&rsquo;s time zone: </label>
      <NativeSelect id="usage-zone" size="sm" className="w-auto max-w-full" value={timeZone} onChange={e => void change(e.target.value)}>
        {zoneOptions(timeZone).map(z => <option key={z} value={z}>{z}</option>)}
      </NativeSelect>
      {problem && <p role="alert" className="mt-1 text-small text-danger">{problem}</p>}
    </div>
  )
}
