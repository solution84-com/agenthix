import { useEffect, useId, useState } from 'react'
import { useQuery, useAction, getProjectRunLimits, setProjectRunLimits } from 'wasp/client/operations'
import { INPUT, Part, ReadOnlyValue } from '../../projects/pages/settings/Part'
import { usePartSave } from '../../projects/pages/settings/usePartSave'

type RunLimits = {
  org: { timeLimitMinutes: number; turnLimit: number }
  own: { timeLimitMinutes: number | null; turnLimit: number | null }
}

/**
 * A project's run time limit, in its Settings (every screen reviewed spec §3):
 * it applies to every run, conversations included, so it lives here. The turn
 * limit, which applies only to runs no person started, is in the Automation
 * tool's Rules. A project can only tighten the organisation's limit. Saved on
 * leaving the field; a person who may not change it reads the limit in force.
 */
export function ProjectRunTimeLimit({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const id = useId()
  const { data, refetch } = useQuery(getProjectRunLimits, { projectId })
  const saveLimits = useAction(setProjectRunLimits)
  const limits = data as RunLimits | undefined
  const [minutes, setMinutes] = useState('')
  const save = usePartSave()

  useEffect(() => { if (limits) setMinutes(limits.own.timeLimitMinutes?.toString() ?? '') }, [limits?.own.timeLimitMinutes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!limits) return <p className="text-small text-text-muted">Loading…</p>

  const label = 'Run time limit (minutes)'
  const hint = `Every run in this project, conversations included, is stopped after this. The organisation allows up to ${limits.org.timeLimitMinutes}; leave it empty to use that.`
  if (!canEdit) {
    return (
      <Part label={label} htmlFor={id} hint={hint}>
        <ReadOnlyValue id={id}>{limits.own.timeLimitMinutes ?? limits.org.timeLimitMinutes}</ReadOnlyValue>
      </Part>
    )
  }

  const commit = async () => {
    const next = minutes.trim()
    if (next === (limits.own.timeLimitMinutes?.toString() ?? '')) { save.clear(); return }
    if (next !== '' && !/^\d+$/.test(next)) { save.fail('Enter a whole number of minutes'); return }
    await save.save(async () => {
      await saveLimits({ projectId, timeLimitMinutes: next === '' ? null : Number(next), turnLimit: limits.own.turnLimit })
      await refetch()
    })
  }

  return (
    <Part label={label} htmlFor={id} save={save} hint={hint}>
      <input
        id={id} inputMode="numeric" value={minutes} placeholder={String(limits.org.timeLimitMinutes)}
        onChange={e => setMinutes(e.target.value)} onBlur={() => void commit()}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`${INPUT} w-28`}
      />
    </Part>
  )
}
