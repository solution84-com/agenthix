import { Facts, Section, LinkButton } from './ProjectAgentParts'
import type { ProjectAgentDetailData } from './projectAgentTypes'

/**
 * "In this project": the model it works with here, beside the agent's own. Every member sees it; Edit shows only
 * for the project's admins. What the agent may do here is Permissions here, beside it.
 */
export function ProjectAgentInThisProject({ detail, modelLabel, onEdit }: {
  detail: ProjectAgentDetailData
  modelLabel: (id: string, runtime: string) => string
  onEdit?: () => void
}) {
  const { own, narrowing } = detail.inThisProject
  const modelHere = narrowing?.model ?? own.model
  const changed = modelHere !== own.model
  return (
    <Section title="In this project" action={onEdit && <LinkButton onClick={onEdit}>Edit</LinkButton>}>
      <Facts rows={[
        ['Model', (
          <span key="m">
            {modelLabel(modelHere, detail.agent.runtime)}{' '}
            <span className="text-text-muted">· {changed ? `its own: ${modelLabel(own.model, detail.agent.runtime)}` : 'its own'}</span>
          </span>
        )],
      ]} />
    </Section>
  )
}
