import { AutomationTool } from '../../automation/pages/AutomationTool'

/** The Automation tool (spec §3), the same for a project and the personal space. */
export function ProjectAutomationTool({ projectId, isProjectAdmin }: { projectId: string; isProjectAdmin: boolean }) {
  return <AutomationTool projectId={projectId} isProjectAdmin={isProjectAdmin} />
}
