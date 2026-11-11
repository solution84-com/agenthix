import { useState } from 'react'
import { useQuery, getMyConnections, getProjects } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import type { ConnectionView } from '../../shared/connections'
import { SettingsSubpage } from '../../settings/pages/SettingsSubpage'
import { CreateConnectionForm } from './CreateConnectionForm'
import { ConnectionList } from './ConnectionList'
import { NewConnectionToken } from './NewConnectionToken'
import { connectionProjectOptions } from './projectOptions'
import { BRANDING } from '@agenthix/core'
import { ReadFailure } from '@agenthix/ui/attention'

/**
 * A person's own connections to hq (adr-0090): what lets a tool outside the
 * product — their own Claude Code, or any MCP client — act as them, never as more.
 */
export function ConnectionsPage() {
  const { data: overview, isLoading, error, refetch } = useQuery(getMyConnections)
  const { data: projects } = useQuery(getProjects)
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<{ token: string; connection: ConnectionView } | null>(null)

  const projectOptions = connectionProjectOptions(projects)

  return (
    <SettingsSubpage title="Connections">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-h1 font-medium text-text-primary">Connections</h1>
            <p className="text-small text-text-secondary mt-0.5">
              Let a tool outside {BRANDING.displayName} — your own Claude Code, or any MCP client — work in hq as you. A
              connection can do only what you can, and only what you turn on for it.
            </p>
          </div>
          {!creating && (
            <Button onClick={() => { setCreating(true); setIssued(null) }}>New connection</Button>
          )}
        </div>

        {issued && overview && (
          <NewConnectionToken
            name={issued.connection.name}
            token={issued.token}
            mcpUrl={overview.mcpUrl}
            onDone={() => setIssued(null)}
          />
        )}

        {creating && (
          <CreateConnectionForm
            projects={projectOptions}
            onCreated={result => { setIssued(result); setCreating(false) }}
            onCancel={() => setCreating(false)}
          />
        )}

        {isLoading ? (
          <p className="text-body text-text-muted">Loading…</p>
        ) : error ? (
          <ReadFailure what="Your connections" retry={() => void refetch()} />
        ) : (
          <ConnectionList connections={overview?.connections ?? []} />
        )}
      </div>
    </SettingsSubpage>
  )
}
