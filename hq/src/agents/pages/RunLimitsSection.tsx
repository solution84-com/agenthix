import { useEffect, useId, useState } from 'react'
import { useQuery, useAction, getOrgRunLimits, updateOrgRunLimits, getProjectRunLimits, setProjectRunLimits } from 'wasp/client/operations'
import { CARD, CardHeading, useCredentialCall } from '../../model-access/pages/modelAccessParts'
import { Button, FIELD as FIELD_LOOK } from '@agenthix/ui/primitives'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

const FIELD = `w-28 rounded-lg px-3 py-2 text-body ${FIELD_LOOK}`

type Scope = { kind: 'org' } | { kind: 'project'; projectId: string }

function LimitField({ label, hint, value, onChange, placeholder }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-text-muted text-small mb-1">{label}</label>
      <input id={id} inputMode="numeric" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={FIELD} />
      <p className="text-text-muted text-small mt-1">{hint}</p>
    </div>
  )
}

const toNumber = (v: string): number => (v.trim() === '' ? NaN : Number(v))
const toChoice = (v: string): number | null => (v.trim() === '' ? null : Number(v))

/**
 * Run limits (spec §7). The org sets what every run starts with; a project's
 * admin may only tighten them, and the stricter applies when a run starts.
 */
export function RunLimitsSection({ scope }: { scope: Scope }) {
  const orgQuery = useQuery(getOrgRunLimits, undefined, { enabled: scope.kind === 'org' })
  const projectQuery = useQuery(getProjectRunLimits, scope.kind === 'project' ? { projectId: scope.projectId } : undefined, {
    enabled: scope.kind === 'project',
  })
  const read = useBackgroundRead(scope.kind === 'org' ? orgQuery : projectQuery, { what: 'The run limits' })
  const saveOrg = useAction(updateOrgRunLimits)
  const saveProject = useAction(setProjectRunLimits)
  const { busy, problem, run } = useCredentialCall()
  const [minutes, setMinutes] = useState('')
  const [turns, setTurns] = useState('')

  const org = scope.kind === 'org' ? orgQuery.data : projectQuery.data?.org
  const own = scope.kind === 'project' ? projectQuery.data?.own : undefined

  useEffect(() => {
    if (scope.kind === 'org' && orgQuery.data) {
      setMinutes(String(orgQuery.data.timeLimitMinutes))
      setTurns(String(orgQuery.data.turnLimit))
    }
    if (scope.kind === 'project' && projectQuery.data) {
      setMinutes(projectQuery.data.own.timeLimitMinutes?.toString() ?? '')
      setTurns(projectQuery.data.own.turnLimit?.toString() ?? '')
    }
  }, [scope.kind, orgQuery.data, projectQuery.data])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const ok = await run(() => scope.kind === 'org'
      ? saveOrg({ timeLimitMinutes: toNumber(minutes), turnLimit: toNumber(turns) })
      : saveProject({ projectId: scope.projectId, timeLimitMinutes: toChoice(minutes), turnLimit: toChoice(turns) }))
    if (ok) {
    }
  }

  const isProject = scope.kind === 'project'
  const limitedByOrg = own && org && (
    (own.timeLimitMinutes !== null && own.timeLimitMinutes > org.timeLimitMinutes) ||
    (own.turnLimit !== null && own.turnLimit > org.turnLimit)
  )

  return (
    <div className={CARD}>
      <CardHeading title="Run limits">
        {isProject
          ? "A run is stopped at the stricter of the organisation's limit and this project's. Leave a field empty to use the organisation's."
          : 'Every run is stopped after the time limit. A run no person started, such as one a start time or an agent starts, is also stopped after the turn limit. A project can only tighten these.'}
      </CardHeading>
      {!org ? (
        read.failedWithoutData ? read.nudge : <p className="text-text-muted text-body">Loading…</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          {read.nudge}
          <div className="flex flex-wrap gap-6">
            <LimitField
              label="Time limit (minutes)"
              hint={isProject ? `The organisation allows up to ${org.timeLimitMinutes}.` : 'From 1 minute to 24 hours (1440).'}
              value={minutes} onChange={setMinutes} placeholder={isProject ? String(org.timeLimitMinutes) : undefined}
            />
            <LimitField
              label="Turn limit"
              hint={isProject ? `The organisation allows up to ${org.turnLimit}. A turn is one round trip with the model.` : 'A turn is one round trip with the model. From 1 to 1000.'}
              value={turns} onChange={setTurns} placeholder={isProject ? String(org.turnLimit) : undefined}
            />
          </div>
          {limitedByOrg && (
            <p className="text-text-muted text-small">The organisation has since set a stricter limit than one of these; its limit applies.</p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            <ShowAttention kind="alert" text={problem} title="The limits were not saved" />
          </div>
        </form>
      )}
    </div>
  )
}
