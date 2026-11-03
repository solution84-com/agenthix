import { Button, Modal } from '@agenthix/ui/primitives'
import type { SkillGroup } from './placeSkillsModel'

/** *All on* and *All off* name what they would switch before they do it. */
export function ConfirmSwitchAll({ on, group, names, busy, onCancel, onConfirm }: {
  on: boolean
  group?: SkillGroup
  names: string[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const scope = group ? 'in this group' : 'on this page'
  return (
    <Modal open onClose={onCancel} title={on ? 'Switch these skills on?' : 'Switch these skills off?'} maxWidth="max-w-md">
      <div className="space-y-3" data-testid="confirm-switch-all">
        {names.length === 0 ? (
          <p className="text-small text-text-secondary">Nothing {scope} would change. Nothing was changed.</p>
        ) : (
          <>
            <p className="text-small text-text-secondary">
              {on ? 'Agents will follow the files of' : 'Agents will stop using'} {names.length === 1 ? 'this skill' : `these ${names.length} skills`}, as they are now:
            </p>
            <ul className="max-h-48 list-disc overflow-auto pl-5 text-body text-text-primary">{names.map((n) => <li key={n}>{n}</li>)}</ul>
            {on && <p className="text-small text-text-muted">Only a skill whose files are still the ones shown is switched; any other is left as it was.</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy || names.length === 0}>{on ? 'All on' : 'All off'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export function ConfirmRemove({ name, note, busy, onCancel, onConfirm }: { name: string; note: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open onClose={onCancel} title={`Remove ${name}?`} maxWidth="max-w-md">
      <div className="space-y-3" data-testid="confirm-remove-skill">
        <p className="text-small text-text-secondary">{note}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>Remove</Button>
        </div>
      </div>
    </Modal>
  )
}
