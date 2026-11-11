import { useQuery, getPlaceSecretHistory, getPlaceVariableHistory } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { RECORD_WORDS } from '../pages/secretsWords'
import type { SecretRecordView, SecretsPlace, ValueKind, VariableChangeView } from '../pages/secretsTypes'
import { ReadFailure } from '@agenthix/ui/attention'

const stamp = (d: Date | string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function SecretHistory({ place, name }: { place: SecretsPlace; name: string }) {
  const { data, error, refetch } = useQuery(getPlaceSecretHistory, { place, name })
  const rows: SecretRecordView[] | undefined = data
  if (error) return <ReadFailure what="The history" retry={() => void refetch()} />
  if (!rows) return <p className="text-small text-text-muted">Loading…</p>
  if (rows.length === 0) return <p className="text-small text-text-muted">Nothing recorded yet.</p>
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={i} className="text-small text-text-secondary">
          <span className="text-text-primary">{RECORD_WORDS[r.action]}</span>{r.by ? ` by ${r.by.name}` : ''} · {stamp(r.at)}
        </li>
      ))}
    </ul>
  )
}

function VariableHistory({ place, name }: { place: SecretsPlace; name: string }) {
  const { data, error, refetch } = useQuery(getPlaceVariableHistory, { place, name })
  const rows: VariableChangeView[] | undefined = data
  if (error) return <ReadFailure what="The history" retry={() => void refetch()} />
  if (!rows) return <p className="text-small text-text-muted">Loading…</p>
  if (rows.length === 0) return <p className="text-small text-text-muted">Nothing recorded yet.</p>
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={i} className="break-words text-small text-text-secondary">
          {r.action === 'set' && <>Set to <code>{r.newValue}</code></>}
          {r.action === 'changed' && <><code>{r.oldValue}</code> → <code>{r.newValue}</code></>}
          {r.action === 'deleted' && <>Deleted (was <code>{r.oldValue}</code>)</>}
          {' · '}{r.by.name} · {stamp(r.at)}
        </li>
      ))}
    </ul>
  )
}

/** A secret's record (set, replaced, every run that used it; never the value) or a variable's changes, old → new. */
export function HistoryDialog({ open, onClose, place, kind, name }: { open: boolean; onClose: () => void; place: SecretsPlace; kind: ValueKind; name: string }) {
  return (
    <Modal open={open} onClose={onClose} title={`History of ${name}`} maxWidth="max-w-md">
      <div className="space-y-4" data-testid="history-dialog">
        {kind === 'secret' ? <SecretHistory place={place} name={name} /> : <VariableHistory place={place} name={name} />}
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  )
}
