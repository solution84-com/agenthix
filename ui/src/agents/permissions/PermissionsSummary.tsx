import { useMemo } from 'react'
import { CUSTOM_PRESET, detectPreset, organisationDraft, presetsFor, summaryLines } from './permissionsModel'
import type { OrganisationPermissionsData } from './permissionsTypes'

/** The warning mark a bypassed agent carries wherever approval is summarised. */
export function BypassedMark() {
  return <span className="rounded-md bg-danger/15 px-1.5 text-micro font-medium text-danger">⚠ Approval bypassed</span>
}

/** The organisation's permissions at a glance: approval, the preset, and one line per group. */
export function PermissionsSummary({ data }: { data: OrganisationPermissionsData }) {
  const lines = useMemo(() => {
    const draft = organisationDraft(data)
    const preset = detectPreset(draft)
    const label = presetsFor(draft).find(p => p.id === preset)?.label ?? 'Custom'
    return summaryLines(draft, preset === CUSTOM_PRESET ? 'Custom' : label)
  }, [data])
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {lines.map(l => (
        <div key={l.label} className="contents">
          <dt className="text-text-muted">{l.label}</dt>
          <dd className="min-w-0 text-text-primary">
            {l.text}
            {l.label === 'Approval' && data.approval === 'bypassed' && <> <BypassedMark /></>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
