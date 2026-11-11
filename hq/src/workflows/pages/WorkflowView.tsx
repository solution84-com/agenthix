import { useState } from 'react'
import { useQuery, getWorkflow, getWorkflowVersion, switchWorkflow, useAction } from 'wasp/client/operations'
import { PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import { RunButton } from '../components/RunButton'
import { RunsTab } from '../components/RunsTab'
import { StepsTab } from '../components/StepsTab'
import { VersionsTab } from '../components/VersionsTab'
import { WorkflowSwitch } from '../components/WorkflowSwitch'
import { useWorkflowNames } from '../components/useWorkflowNames'
import { TabNav } from '../../shared/components/ui/TabNav'
import { whenWords } from './workflowWords'
import type { WorkflowPlace } from './workflowTypes'
import type { WorkflowsScreen } from './useWorkflowsUrl'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

type Tab = 'steps' | 'versions' | 'runs'

/**
 * A workflow (workflows spec part 5, U3): its switch and Run in the header, then Steps (the approved version as people
 * read it), Versions (every version, any two comparable) and Runs.
 */
export function WorkflowView({ place, screen, onBack, onTab, onVersion, onRun, onRunStarted }: {
  place: WorkflowPlace
  screen: Extract<WorkflowsScreen, { view: 'workflow' }>
  onBack: () => void
  onTab: (tab: Tab) => void
  onVersion: (number: number, against?: number) => void
  onRun: (runId: string) => void
  onRunStarted: (runId: string) => void
}) {
  const { workflowId, tab } = screen
  const { data: workflow, error } = useQuery(getWorkflow, { workflowId })
  const approved = workflow?.versions.find((v) => v.state === 'APPROVED')
  const { data: approvedVersion } = useQuery(getWorkflowVersion, approved ? { workflowId, number: approved.number } : undefined, { enabled: !!approved })
  const toggle = useAction(switchWorkflow)
  const names = useWorkflowNames(place)
  const [switchError, setSwitchError] = useState<unknown>(null)

  if (error) return <ReadFailure what="The workflow" error={error} />
  if (!workflow) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  const waiting = workflow.versions.filter((v) => v.state === 'PROPOSED')
  const approval = approved?.approvals[0]
  const status = [
    approved ? `version ${approved.number}, ${approval?.automatic ? 'kept by HQ across an image update' : `approved by ${names.person(approval?.approvedById)}`} ${whenWords(approval?.approvedAt)}` : 'no approved version yet',
    ...(waiting.length ? [`version ${waiting[0].number} waits for ${workflow.mayAdminister ? 'you' : 'an administrator'}`] : []),
  ].join(' · ')

  const flip = async () => {
    setSwitchError(null)
    try { await toggle({ workflowId, enabled: !workflow.enabled }) } catch (e) { setSwitchError(e) }
  }

  return (
    <div className="max-w-3xl space-y-4 p-4">
      <ViewHeaderRow><PanelHeaderContent back="Workflows" onBack={onBack} title={workflow.name} /></ViewHeaderRow>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2 font-medium text-text-primary">{workflow.name}</h2>
          <p className="break-words text-small text-text-secondary">{approvedVersion?.definition.description ? `${approvedVersion.definition.description} · ` : ''}{status}</p>
        </div>
        <WorkflowSwitch on={workflow.enabled} label={`${workflow.name} is ${workflow.enabled ? 'on' : 'off'}`} onToggle={workflow.mayAdminister && approved ? () => void flip() : undefined} />
        {workflow.mayRun && <RunButton place={place} workflowId={workflowId} name={workflow.name} definition={approvedVersion?.definition ?? null} enabled={workflow.enabled} onStarted={onRunStarted} size="md" className="max-lg:w-full max-lg:justify-center" />}
      </div>
      <ShowAttention text={switchError} title="The workflow was not changed" onClose={() => setSwitchError(null)} />
      {waiting.length > 0 && workflow.mayAdminister && (
        <button type="button" onClick={() => onVersion(waiting[0].number)} className="w-full rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-left text-small text-text-primary hover:border-border-strong">
          Version {waiting[0].number} is waiting for you. <span className="font-medium text-link">Review it</span>
        </button>
      )}
      <TabNav
        active={tab}
        onChange={onTab}
        tabs={[{ value: 'steps', label: 'Steps' }, { value: 'versions', label: 'Versions', count: workflow.versions.length }, { value: 'runs', label: 'Runs' }]}
      />
      {tab === 'steps' && (approvedVersion
        ? <StepsTab workflowId={workflowId} number={approvedVersion.number} definition={approvedVersion.definition} />
        : <p className="text-small text-text-muted">{approved ? 'Loading…' : 'Nothing is approved yet, so there are no steps to show. Open a version under Versions to read it.'}</p>)}
      {tab === 'versions' && <VersionsTab place={place} versions={workflow.versions} onOpen={(n) => onVersion(n)} onCompare={onVersion} />}
      {tab === 'runs' && <RunsTab workflowId={workflowId} onOpen={onRun} />}
    </div>
  )
}
