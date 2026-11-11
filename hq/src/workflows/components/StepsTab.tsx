import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Lock } from 'lucide-react'
import { useQuery, getWorkflowVersion } from 'wasp/client/operations'
import type { WorkflowDefinition } from '@agenthix/core'
import { formatSeconds } from '../pages/workflowWords'

/** The file a step runs, when its `run` names one of the version's files (`./deploy/upload.sh` → `deploy/upload.sh`). */
export function fileOfStep(run: string, files: string[]): string | null {
  const word = run.trim().split(/\s+/)[0] ?? ''
  const path = word.replace(/^\.\//, '')
  return files.includes(path) ? path : null
}

function FileView({ workflowId, number, path }: { workflowId: string; number: number; path: string }) {
  const { data } = useQuery(getWorkflowVersion, { workflowId, number })
  const file = data?.files.find((f) => f.path === path)
  return (
    <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-surface-1 p-2 font-mono text-micro text-text-primary" data-testid="step-file">
      {!data ? 'Loading…' : file?.text ?? `${path} is not text (${file?.size ?? 0} bytes).`}
    </pre>
  )
}

/**
 * The approved version as people read it (U3): each step's name, what it runs (a file one click away), and the secrets
 * that step gets, each marked with a lock; a step with none says so. Then the variables, the hosts and the time limit.
 */
export function StepsTab({ workflowId, number, definition }: { workflowId: string; number: number; definition: WorkflowDefinition }) {
  const [shown, setShown] = useState<number | null>(null)
  return (
    <div className="space-y-5">
      <ol className="divide-y divide-border-subtle rounded-xl border border-border bg-card" aria-label="Steps">
        {definition.steps.map((s, i) => {
          const file = fileOfStep(s.run, definition.files)
          return (
            <li key={i} className="px-3 py-2.5" data-testid="workflow-step">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="w-5 text-small text-text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 text-body font-medium text-text-primary">{s.name}</span>
                {s.secrets.length === 0 ? (
                  <span className="text-small text-text-muted">no secrets</span>
                ) : s.secrets.map((n) => (
                  <span key={n} className="inline-flex items-center gap-1 rounded-full bg-warning/13 px-2.5 text-micro font-medium leading-[18px] text-warning" data-testid="step-secret"><Lock size={10} aria-hidden />{n}</span>
                ))}
              </div>
              <div className="ml-8 mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-small text-text-secondary">{s.run}</code>
                {file && (
                  <button type="button" className={`rounded text-small text-link hover:underline ${FOCUS_RING}`} onClick={() => setShown(shown === i ? null : i)}>
                    {shown === i ? 'hide' : 'view'}
                  </button>
                )}
              </div>
              {file && shown === i && <div className="ml-8"><FileView workflowId={workflowId} number={number} path={file} /></div>}
            </li>
          )
        })}
      </ol>
      <section aria-label="Variables it uses" className="space-y-1.5">
        <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Variables it uses</h3>
        {definition.variables.length === 0 ? <p className="text-small text-text-muted">None.</p> : (
          <p className="flex flex-wrap gap-1.5">{definition.variables.map((v) => <span key={v} className="rounded-full bg-chip px-2.5 text-micro leading-[18px] text-text-secondary">{v}</span>)}</p>
        )}
      </section>
      <section aria-label="Hosts and time limit" className="space-y-1.5">
        <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Hosts it can reach, and its time limit</h3>
        <p className="flex flex-wrap gap-1.5">
          {definition.hosts.length === 0 && <span className="text-small text-text-muted">No network.</span>}
          {definition.hosts.map((h) => <span key={`${h.host}:${h.port}`} className="rounded-full bg-chip px-2.5 text-micro leading-[18px] text-text-secondary">{h.host}:{h.port}</span>)}
          <span className="rounded-full bg-chip px-2.5 text-micro leading-[18px] text-text-secondary">{formatSeconds(definition.timeoutSeconds)}</span>
        </p>
      </section>
    </div>
  )
}
