import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useQuery, getPlaceInstructions } from 'wasp/client/operations'
import { MarkdownMessage } from '../../../shared/components/MarkdownMessage'
import { ReadFailure } from '@agenthix/ui/attention'

type File = { path: string; text: string | null; modifiedAt: string | null; tooLarge: boolean }

function Source({ label, from, openPath }: { label: string; from: string; openPath?: string }) {
  return (
    <div className="mt-4 flex items-baseline justify-between gap-2">
      <span className="text-small"><b className="font-medium text-text-primary">{label}</b> <span className="text-text-muted">· {from}</span></span>
      {openPath ? (
        <Link to={`/chat?tool=files&file=${encodeURIComponent(openPath)}`} className={`rounded shrink-0 text-small text-link hover:underline ${FOCUS_RING}`}>Open in Files</Link>
      ) : (
        <span className="shrink-0 text-small text-text-muted">read only</span>
      )}
    </div>
  )
}

function FileText({ file }: { file: File }) {
  if (file.tooLarge) return <p className="mt-1 text-small text-text-muted">Too large to show here. Open it in Files.</p>
  if (!file.text?.trim()) return <p className="mt-1 text-small text-text-muted">None yet.</p>
  return <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-subtle bg-surface-2 p-3 text-small"><MarkdownMessage content={file.text} /></div>
}

/**
 * Your instructions (spec §3): the organisation's for this agent, read only, then the person's own — for this
 * agent and for every agent in their Chat — which they open in their own Files. A person changes theirs by asking
 * the agent; editing by hand waits for a write path to a site.
 */
export function AgentInstructionsTool({ agentId }: { agentId: string }) {
  const { data, isLoading, error, refetch } = useQuery(getPlaceInstructions, { agentId })
  return (
    <div className="p-4">
      <p className="text-small text-text-secondary">What it is told when it works with you in your Chat. Projects add their own, shown in each project's Agents tool.</p>
      {isLoading && <p className="mt-3 text-small text-text-muted">Loading…</p>}
      {error && <ReadFailure what="The instructions" retry={() => void refetch()} />}
      {data && (
        <>
          <Source label="The organisation's" from="everywhere" />
          <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-subtle bg-surface-2 p-3 text-small">
            {data.organisation?.instructions ? <MarkdownMessage content={data.organisation.instructions} /> : <span className="text-text-muted">None.</span>}
          </div>
          {data.forAgent && (
            <>
              <Source label="Yours" from="for this agent, in your Chat" openPath={data.forAgent.file.path} />
              <FileText file={data.forAgent.file} />
            </>
          )}
          <Source label="Yours" from="for every agent in your Chat · AGENTS.md" openPath={data.everyAgent.file.path} />
          <FileText file={data.everyAgent.file} />
          <p className="mt-4 text-small text-text-muted">To change them, ask it in a conversation — it can edit your instructions — or open them in Files.</p>
        </>
      )}
    </div>
  )
}
