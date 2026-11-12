import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useQuery, getPlaceSecrets, getPlaceVariables } from 'wasp/client/operations'
import { Button, EmptyState, SegmentedControl } from '@agenthix/ui/primitives'
import { useWorkspaces } from '../../storage/pages/filesToolData'
import { AddSecretDialog } from '../components/AddSecretDialog'
import { ColumnHeads } from '../components/ColumnHeads'
import { SecretRow } from '../components/SecretRow'
import { VariableDialog } from '../components/VariableDialog'
import { VariableRow } from '../components/VariableRow'
import type { SecretsPlace } from './secretsTypes'
import { useSecretsUrl, type SecretsTab } from './useSecretsUrl'
import { useBackgroundRead } from '@agenthix/ui/attention'

export const SECRETS_REFRESH_MS = 30_000

const TAB_NOTE: Record<SecretsTab, string> = {
  secrets: 'Encrypted, and never shown again once saved. Agents see their names only; a workflow step gets one only if it names it.',
  variables: 'Plain values, shown to everyone here and to agents. A workflow that names one has it as an environment variable in every step. Never put a secret here.',
}

/**
 * The Vault: secrets and variables (secrets spec part 3; screens part 5, U6), two tabs with the same columns.
 * Everyone in the place reads; only its administrators see the controls that write.
 */
export function SecretsTool({ place }: { place: SecretsPlace }) {
  const { tab, setTab } = useSecretsUrl()
  const secrets = useQuery(getPlaceSecrets, { place }, { refetchInterval: SECRETS_REFRESH_MS })
  const variables = useQuery(getPlaceVariables, { place }, { refetchInterval: SECRETS_REFRESH_MS })
  const secretsRead = useBackgroundRead(secrets, { what: 'Secrets', pollMs: SECRETS_REFRESH_MS })
  const variablesRead = useBackgroundRead(variables, { what: 'Variables', pollMs: SECRETS_REFRESH_MS })
  const { workspaces } = useWorkspaces({ ownerType: place.type, ownerId: place.id })
  const [adding, setAdding] = useState(false)
  const [addingSecretNamed, setAddingSecretNamed] = useState<string | null>(null)
  const active = tab === 'secrets' ? secrets : variables
  const mayChange = secrets.data?.mayChange ?? variables.data?.mayChange ?? false
  const withRepo = (workspaces ?? []).find((w) => w.repoUrl)
  const repository = withRepo?.repoUrl ? { workspaceId: withRepo.id, repoUrl: withRepo.repoUrl } : null

  if (!secrets.data || !variables.data) {
    const failed = (secretsRead.failedWithoutData && secretsRead.nudge) || (variablesRead.failedWithoutData && variablesRead.nudge)
    return failed ? <>{failed}</> : <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  }

  const rows = tab === 'secrets' ? secrets.data.secrets : variables.data.variables
  return (
    <div className="max-w-5xl space-y-4 p-4">
      {secretsRead.nudge || variablesRead.nudge}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SegmentedControl kind="tabs" label="Vault" value={tab} onChange={setTab}
            options={[
              { value: 'secrets', label: `Secrets · ${secrets.data.secrets.length}` },
              { value: 'variables', label: `Variables · ${variables.data.variables.length}` },
            ]} />
        </div>
        {mayChange && <Button onClick={() => setAdding(true)}>{tab === 'secrets' ? 'Add a secret' : 'Add a variable'}</Button>}
      </div>
      <p className="text-small text-text-secondary">{TAB_NOTE[tab]}</p>
      {!mayChange && <p className="text-small text-text-muted">Only the administrators change these.</p>}
      {rows.length === 0 ? (
        <EmptyState icon={KeyRound} variant="inline" title={tab === 'secrets' ? 'No secrets yet' : 'No variables yet'}
          hint={tab === 'secrets' ? 'A secret is a key, password or token a workflow step may use. It is kept encrypted and never shown.' : 'A variable is a plain setting, such as a host name or an environment.'} />
      ) : (
        <div className="space-y-2">
          <ColumnHeads />
          <ul aria-label={tab === 'secrets' ? 'Secrets' : 'Variables'} className="space-y-2">
            {tab === 'secrets'
              ? secrets.data.secrets.map((s) => <SecretRow key={s.name} place={place} secret={s} mayChange={mayChange} />)
              : variables.data.variables.map((v) => <VariableRow key={v.name} place={place} variable={v} mayChange={mayChange} onMoveToSecrets={(name) => { setTab('secrets'); setAddingSecretNamed(name) }} />)}
          </ul>
        </div>
      )}
      {adding && tab === 'secrets' && <AddSecretDialog open onClose={() => setAdding(false)} place={place} repository={repository} />}
      {adding && tab === 'variables' && <VariableDialog open onClose={() => setAdding(false)} place={place} onMoveToSecrets={(name) => { setAdding(false); setTab('secrets'); setAddingSecretNamed(name) }} />}
      {addingSecretNamed !== null && <AddSecretDialog open onClose={() => setAddingSecretNamed(null)} place={place} repository={repository} initialName={addingSecretNamed} />}
    </div>
  )
}
