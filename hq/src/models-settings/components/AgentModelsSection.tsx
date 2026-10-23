import { getAgentModels, useQuery } from 'wasp/client/operations'
import { ManageSection } from '../../agents/pages/manage/ManageSection'
import { AgentModels } from './AgentModels'

/** An agent's Models on its page in the admin area: a summary of what it uses, and the editor behind Edit. */
export function AgentModelsSection({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { data } = useQuery(getAgentModels, { agentId })
  const follow = data ? `${data.orgName}'s default` : ''
  const line = (own: { text: string } | null, org: { text: string } | null) => own?.text ?? (org ? `${follow} · ${org.text}` : follow)
  return (
    <ManageSection
      title="Models"
      summary={data ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-text-muted">Conversation</dt><dd className="text-text-primary">{line(data.conversation, data.orgConversation)}</dd>
          <dt className="text-text-muted">Workers</dt><dd className="text-text-primary">{line(data.worker, data.orgWorker)}</dd>
          <dt className="text-text-muted">Speech to text</dt><dd className="text-text-primary">{line(data.stt, data.orgStt)}</dd>
          <dt className="text-text-muted">Text to speech</dt><dd className="text-text-primary">{line(data.tts, data.orgTts)}</dd>
        </dl>
      ) : <span className="text-text-muted">Loading…</span>}
      editor={<AgentModels agentId={agentId} agentName={agentName} />}
    />
  )
}
