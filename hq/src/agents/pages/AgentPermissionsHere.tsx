import { useMemo } from 'react'
import { useQuery, useAction, getAgentPermissionsHere, getAgentOverride, setAgentOverride } from 'wasp/client/operations'
import { AgentPermissionsView, narrowingDraft, type PermissionsHereData, type PermissionsSave, type AgentOverrideValue } from '@agenthix/ui/agents'
import { useBackgroundRead } from '@agenthix/ui/attention'

/**
 * An agent's permissions below the organisation (every screen reviewed spec §3): "Permissions here" in a project,
 * "Your permissions in Chat" for a person. The organisation's setting is beside every line; a save replaces this
 * level's row, so the model it holds is sent back as it is.
 */
export function AgentPermissionsHere({ agentId, agentName, boundaryType, boundaryId, title, readOnlyNote }: {
  agentId: string
  agentName: string
  boundaryType: 'project' | 'user'
  boundaryId: string
  title: string
  readOnlyNote?: string
}) {
  const args = { agentId, boundaryType, boundaryId }
  const query = useQuery(getAgentPermissionsHere, args)
  const { data, isLoading } = query
  const read = useBackgroundRead(query, { what: 'The permissions' })
  const { data: stored } = useQuery(getAgentOverride, { boundaryType, boundaryId, agentId })
  const save = useAction(setAgentOverride)
  const view = data as (PermissionsHereData & { canChange: boolean }) | undefined
  const initial = useMemo(() => (view ? narrowingDraft(view) : null), [view])

  if (isLoading) return <p className="text-small text-text-muted">Loading permissions…</p>
  if (!view || !initial) return read.nudge ?? <p className="text-small text-text-muted">Loading permissions…</p>
  const model = (stored as AgentOverrideValue | null | undefined)?.model ?? null
  return (
    <>
    {read.nudge}
    <AgentPermissionsView
      initial={initial} agentName={agentName} title={title} canChange={view.canChange} readOnlyNote={readOnlyNote}
      onSave={async (next: PermissionsSave) => { await save({ ...args, model, ...next }) }}
    />
    </>
  )
}
