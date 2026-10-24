import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { KIND_WORDS, dayWords, rotationWords, usedByWords } from '../pages/secretsWords'
import type { SecretView, SecretsPlace } from '../pages/secretsTypes'
import { DeleteDialog } from './DeleteDialog'
import { HistoryDialog } from './HistoryDialog'
import { ReplaceSecretDialog } from './ReplaceSecretDialog'
import { RowMenu, type RowMenuItem } from './RowMenu'
import { TurnOffDialog } from './TurnOffDialog'

/** The columns both tabs share: name and description, value, used by, changed, actions. */
export const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_9rem] lg:items-center lg:gap-4'

type Dialog = 'replace' | 'history' | 'turnoff' | 'delete' | null

/** One secret: its kind and never its value, what uses it, when it changed and its rotation. */
export function SecretRow({ place, secret, mayChange }: { place: SecretsPlace; secret: SecretView; mayChange: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)
  const fromGithub = secret.kind === 'from_github'
  const rotation = rotationWords(secret)
  const items: RowMenuItem[] = [
    { label: 'History', onPick: () => setDialog('history') },
    ...(mayChange ? [
      { label: 'Turn off what uses it', onPick: () => setDialog('turnoff') },
      ...(fromGithub ? [] : [{ label: 'Delete', onPick: () => setDialog('delete'), danger: true }]),
    ] : []),
  ]

  return (
    <li className={`rounded-xl border border-border bg-card px-3 py-2.5 ${ROW_GRID}`} data-testid="secret-row">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-body font-semibold text-text-primary"><Lock size={13} aria-hidden className="shrink-0 text-text-muted" /><code className="truncate">{secret.name}</code></div>
        <p className="break-words text-small text-text-secondary">{secret.description}</p>
      </div>
      <p className="mt-1 text-small text-text-secondary lg:mt-0" data-testid="secret-kind">{KIND_WORDS[secret.kind]}</p>
      <p className="break-words text-small text-text-secondary">{usedByWords(secret.usedBy.map((w) => w.name))}</p>
      <div className="text-small text-text-secondary">
        {fromGithub || !secret.changedAt ? 'made for each run' : `${dayWords(secret.changedAt)}${secret.changedBy ? `, ${secret.changedBy.name}` : ''}`}
        {rotation && <div><StatePill tone={rotation.tone}>{rotation.words}</StatePill></div>}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 lg:mt-0">
        {mayChange && !fromGithub && <Button size="sm" variant="secondary" aria-label={`Replace ${secret.name}`} onClick={() => setDialog('replace')}>Replace</Button>}
        <RowMenu name={secret.name} items={items} />
      </div>
      {dialog === 'replace' && <ReplaceSecretDialog open onClose={close} place={place} name={secret.name} />}
      {dialog === 'history' && <HistoryDialog open onClose={close} place={place} kind="secret" name={secret.name} />}
      {dialog === 'turnoff' && <TurnOffDialog open onClose={close} place={place} kind="secret" name={secret.name} usedBy={secret.usedBy} />}
      {dialog === 'delete' && <DeleteDialog open onClose={close} place={place} kind="secret" name={secret.name} usedBy={secret.usedBy} onTurnOff={() => setDialog('turnoff')} />}
    </li>
  )
}
