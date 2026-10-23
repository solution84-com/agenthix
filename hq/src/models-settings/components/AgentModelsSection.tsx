import { AgentModels } from './AgentModels'

/** An agent's models and voice on its page in the admin area: the organisation's rows, each its own or followed. */
export function AgentModelsSection({ agentId, agentName }: { agentId: string; agentName: string }) {
  return (
    <section aria-label="Models and voice" className="border-t border-border-subtle py-4 first:border-t-0">
      <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Models and voice</h3>
      <div className="mt-3"><AgentModels agentId={agentId} agentName={agentName} /></div>
    </section>
  )
}
