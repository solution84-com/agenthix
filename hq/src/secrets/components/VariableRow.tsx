import { useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { dayWords, usedByWords } from '../pages/secretsWords'
import type { SecretsPlace, VariableView } from '../pages/secretsTypes'
import { DeleteDialog } from './DeleteDialog'
import { HistoryDialog } from './HistoryDialog'
import { RowMenu, type RowMenuItem } from './RowMenu'
import { ROW_GRID } from './SecretRow'
import { TurnOffDialog } from './TurnOffDialog'
import { VariableDialog } from './VariableDialog'

type Dialog = 'edit' | 'history' | 'turnoff' | 'delete' | null

/** One variable, its value in plain sight. */
export function VariableRow({ place, variable, mayChange, onMoveToSecrets }: {
  place: SecretsPlace
  variable: VariableView
  mayChange: boolean
  onMoveToSecrets: (name: string) => void
}) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)
  const items: RowMenuItem[] = [
    { label: 'History', onPick: () => setDialog('history') },
    ...(mayChange ? [
      { label: 'Turn off what uses it', onPick: () => setDialog('turnoff') },
      { label: 'Delete', onPick: () => setDialog('delete'), danger: true },
    ] : []),
  ]

  return (
    <li className={`rounded-xl border border-border bg-card px-3 py-2.5 ${ROW_GRID}`} data-testid="variable-row">
      <div className="min-w-0"><code className="block truncate text-body font-medium text-text-primary">{variable.name}</code></div>
      <p className="mt-1 break-all text-small text-text-primary lg:mt-0" data-testid="variable-value"><code>{variable.value}</code></p>
      <p className="break-words text-small text-text-secondary">{usedByWords(variable.usedBy.map((w) => w.name))}</p>
      <p className="text-small text-text-secondary">{dayWords(variable.changedAt)}, {variable.changedBy.name}</p>
      <div className="mt-2 flex items-center justify-end gap-1 lg:mt-0">
        {mayChange && <Button size="sm" variant="secondary" aria-label={`Edit ${variable.name}`} onClick={() => setDialog('edit')}>Edit</Button>}
        <RowMenu name={variable.name} items={items} />
      </div>
      {dialog === 'edit' && <VariableDialog open onClose={close} place={place} editing={{ name: variable.name, value: variable.value }} onMoveToSecrets={onMoveToSecrets} />}
      {dialog === 'history' && <HistoryDialog open onClose={close} place={place} kind="variable" name={variable.name} />}
      {dialog === 'turnoff' && <TurnOffDialog open onClose={close} place={place} kind="variable" name={variable.name} usedBy={variable.usedBy} />}
      {dialog === 'delete' && <DeleteDialog open onClose={close} place={place} kind="variable" name={variable.name} usedBy={variable.usedBy} onTurnOff={() => setDialog('turnoff')} />}
    </li>
  )
}
