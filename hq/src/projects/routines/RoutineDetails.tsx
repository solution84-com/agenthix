import type { ReactNode } from 'react'
import { useQuery, getModelPickerChoices } from 'wasp/client/operations'
import { AgentPicker } from '@agenthix/ui/tasks'
import { PlaceAvatar } from '@agenthix/ui/primitives'
import { ModelPicker } from '../../shared/components/models/ModelPicker'

function Fact({ label, top, wide, left, children }: { label: string; top?: boolean; wide?: boolean; left?: boolean; children: ReactNode }) {
  return (
    <div className={`grid gap-2 border-b border-border-subtle px-4 py-2 text-small last:border-b-0 ${left ? 'lg:border-r' : ''} ${wide ? 'lg:col-span-2 grid-cols-1' : 'grid-cols-[104px_minmax(0,1fr)] items-center max-sm:grid-cols-1'} ${top ? 'items-start' : ''}`}>
      <span className={`text-text-muted ${top && !wide ? 'pt-2' : ''}`}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * A routine's Details (the Routines design key 6), the same on its page and on New routine: its agent and model, the
 * schedule across the panel, on whose behalf it runs (not chosen: the last person who changed it), and where it is.
 */
export function RoutineDetails({ agent, repeats, model, onBehalfOf, where }: {
  agent: ReactNode
  repeats: ReactNode
  model: ReactNode
  onBehalfOf: ReactNode
  where: ReactNode
}) {
  return (
    <section aria-label="Details" className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex min-h-[52px] items-center border-b border-border-subtle px-4 py-2">
        <h3 className="text-h3 font-medium text-text-primary">Details</h3>
      </div>
      <div className="grid lg:grid-cols-2">
        <Fact label="Agent" left>{agent}</Fact>
        <Fact label="Model">{model}</Fact>
        <Fact label="Repeats" top wide>{repeats}</Fact>
        <Fact label="On behalf of" left>{onBehalfOf}</Fact>
        <Fact label="Where">{where}</Fact>
      </div>
    </section>
  )
}

export function AgentField({ agentId, agents, onChange, disabledWhy }: {
  agentId: string | null
  agents: { id: string; name: string; handle?: string }[]
  onChange: (id: string | null) => void
  disabledWhy?: string
}) {
  return <AgentPicker currentAgentId={agentId} agents={agents} onAssign={onChange} disabled={!!disabledWhy} disabledReason={disabledWhy} />
}

/** The model its runs use: the agent's default unless one is chosen; what the project allows, checked again at a run. */
export function ModelField({ projectId, agentId, value, onChange, disabled }: {
  projectId: string
  agentId: string | null
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const { data } = useQuery(getModelPickerChoices, { projectId, agentId })
  return (
    <ModelPicker field choices={data} value={value} onChange={onChange} defaultRow={{ value: '', setBy: "the agent's default" }} ariaLabel="Model" disabled={disabled}
      labelOf={() => 'A model that is no longer offered'} />
  )
}

export function WhereFact({ projectId, name }: { projectId: string; name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PlaceAvatar kind="project" id={projectId} name={name} size="xs" />
      <span className="truncate">{name}</span>
    </span>
  )
}
