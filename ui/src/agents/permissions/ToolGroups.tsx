import { useState } from 'react'
import { GROUP_TITLES, platformDomain } from './toolLabels'
import { AddPattern, GroupHeading, PatternRow, ToolRow } from './ToolRows'
import type { PermissionsDraft } from './permissionsModel'
import { riskNotes } from './riskNotes'
import type { ToolGroupId, ToolState } from './permissionsTypes'

export interface ToolGroupsActions {
  onTool: (name: string, state: ToolState) => void
  onGroup: (group: ToolGroupId, state: ToolState) => void
  onPattern: (pattern: string, state: ToolState) => void
  onAddPattern: (pattern: string) => void
  onRemovePattern: (pattern: string) => void
}

type Common = { draft: PermissionsDraft; readOnly: boolean } & ToolGroupsActions

function rows(c: Common, group: ToolGroupId, only?: (name: string) => boolean) {
  const narrowing = c.draft.level === 'narrowing'
  return c.draft.tools.filter(t => t.group === group && !t.fixed && (!only || only(t.name))).map(t => (
    <ToolRow key={t.name} tool={t} narrowing={narrowing} bypassed={c.draft.organisationBypassed} readOnly={c.readOnly} onChange={s => c.onTool(t.name, s)} />
  ))
}

function Commands(c: Common) {
  const narrowing = c.draft.level === 'narrowing'
  return (
    <section aria-label={GROUP_TITLES.commands}>
      <GroupHeading title={GROUP_TITLES.commands} />
      {rows(c, 'commands')}
      {c.draft.patterns.map(p => (
        <PatternRow key={p.pattern} pattern={p} narrowing={narrowing} readOnly={c.readOnly} onChange={s => c.onPattern(p.pattern, s)} onRemove={() => c.onRemovePattern(p.pattern)} />
      ))}
      {!c.readOnly && <AddPattern label={narrowing ? '＋ Block a command here' : '＋ Add a command pattern'} onAdd={c.onAddPattern} />}
    </section>
  )
}

function Web(c: Common) {
  const notes = riskNotes(c.draft)
  return (
    <section aria-label={GROUP_TITLES.web}>
      <GroupHeading title={GROUP_TITLES.web} onSetAll={c.readOnly ? undefined : s => c.onGroup('web', s)} />
      {rows(c, 'web')}
      {notes.map(n => (
        <div key={n.title} role="note" className={`mt-2 rounded-lg border px-3 py-2 text-small ${n.tone === 'danger' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warning/30 bg-warning/10 text-warning'}`}>
          <b>{n.title}</b> {n.text}
        </div>
      ))}
    </section>
  )
}

/** Platform tools by domain, shown on request; the always-available ones are not listed. */
function Platform(c: Common) {
  const [open, setOpen] = useState(false)
  const tools = c.draft.tools.filter(t => t.group === 'platform' && !t.fixed)
  const on = tools.filter(t => t.state !== 'never').length
  const domains = [...new Set(tools.map(t => platformDomain(t.name)))]
  return (
    <section aria-label={GROUP_TITLES.platform}>
      <GroupHeading title={GROUP_TITLES.platform} right={`${on} of ${tools.length} on`} onSetAll={c.readOnly ? undefined : s => c.onGroup('platform', s)} />
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="mt-1 rounded text-small text-accent hover:underline">
        {open ? 'Hide the platform tools' : `Show the ${tools.length} platform tools`}
      </button>
      {open && domains.map(domain => (
        <div key={domain}>
          <p className="pt-3 text-micro font-medium uppercase tracking-wide text-text-muted">{domain}</p>
          {rows(c, 'platform', name => platformDomain(name) === domain)}
        </div>
      ))}
    </section>
  )
}

/** Every tool in groups — Files, Commands, Web, Platform — each Always · Ask · Never, as far as the level may choose. */
export function ToolGroups(c: Common) {
  return (
    <div>
      <section aria-label={GROUP_TITLES.files}>
        <GroupHeading title={GROUP_TITLES.files} onSetAll={c.readOnly ? undefined : s => c.onGroup('files', s)} />
        {rows(c, 'files')}
      </section>
      <Commands {...c} />
      <Web {...c} />
      <Platform {...c} />
    </div>
  )
}
