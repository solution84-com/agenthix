import { Link } from 'react-router'
import { Button } from '@agenthix/ui/primitives'
import { MoreMenu, type MenuItem } from '../../../org/components/menus'
import { editPlaceSkillPath } from './placeSkillRoutes'
import { nextVersion, rowActions, skillTitle, stateWords, switchedOffNote, waitingNote, repositoryFolder, type PlaceSkillView, type PlaceSkillsData } from './placeSkillsModel'

export type RowHandlers = {
  onSwitch: (s: PlaceSkillView, on: boolean) => void
  onRead: (s: PlaceSkillView) => void
  onChanges: (s: PlaceSkillView) => void
  onPublish: (s: PlaceSkillView) => void
  onPutBack: (s: PlaceSkillView) => void
  onHistory: (s: PlaceSkillView) => void
  onRemove: (s: PlaceSkillView) => void
  onUpdate: (s: PlaceSkillView) => void
}

const LINK = 'shrink-0 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover'

/** One skill of a place (board P1): its name and state words, what it is waiting for, its switch, and what a person may do. */
export function PlaceSkillRow({ skill, may, busy, handlers }: { skill: PlaceSkillView; may: PlaceSkillsData['may']; busy: boolean; handlers: RowHandlers }) {
  const act = rowActions(skill, may)
  const words = stateWords(skill)
  const note = waitingNote(skill)
  const title = skillTitle(skill)
  const on = skill.state === 'on'
  const menu: MenuItem[] = [
    ...(act.history ? [{ label: 'History', hint: 'Versions, with roll back', onSelect: () => handlers.onHistory(skill) }] : []),
    ...(act.remove ? [{ label: 'Remove', hint: "Deletes the skill's folder", danger: true, separatorBefore: true, onSelect: () => handlers.onRemove(skill) }] : []),
  ]
  const switched = switchedOffNote(skill)
  const switchControl = act.switch ? (
    <button
      type="button" role="switch" aria-checked={on} aria-label={`${title} is ${on ? 'on' : 'off'}`} disabled={busy}
      onClick={() => handlers.onSwitch(skill, !on)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${on ? 'border-accent bg-accent' : 'border-border bg-surface-3'}`}
    >
      <span aria-hidden className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface-1 transition-all ${on ? 'left-6' : 'left-0.5'}`} />
    </button>
  ) : (
    <span className="text-small text-text-muted">{skill.setAsideReason ? 'not used here' : on ? 'on' : 'off'}</span>
  )
  const hasActions = act.changes || (act.read && !act.changes) || act.publish || act.putBack || act.update || act.edit
  // The text keeps its width: the switch and ⋯ stay beside it, the actions sit under it and wrap.
  return (
    <div className={`border-t border-border-subtle py-3 first:border-t-0 ${skill.setAsideReason ? 'opacity-70' : ''}`} data-testid="place-skill-row">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="break-words text-body font-medium text-text-primary">{title}</span>
            <span className="text-small text-text-muted" data-testid="place-skill-words">{words.join(' · ')}</span>
          </div>
          {skill.description && <div className="text-small text-text-secondary">{skill.description}</div>}
          {skill.group === 'WORKSPACE' && <div className="text-small text-text-muted">from {repositoryFolder(skill)}</div>}
          {switched && <div className="text-small text-text-primary" data-testid="place-skill-switched-off">{switched}</div>}
          {note && <div className="text-small text-text-muted" data-testid="place-skill-note">{note}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {switchControl}
          {menu.length > 0 && <MoreMenu items={menu} label={`More about ${title}`} />}
        </div>
      </div>
      {hasActions && (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="place-skill-actions">
          {act.changes && <button type="button" className={LINK} onClick={() => handlers.onChanges(skill)}>What changed</button>}
          {act.read && !act.changes && <button type="button" className={LINK} onClick={() => handlers.onRead(skill)}>Read</button>}
          {act.publish && <Button size="sm" disabled={busy} onClick={() => handlers.onPublish(skill)}>Publish as version {nextVersion(skill)}</Button>}
          {act.putBack && <Button size="sm" variant="secondary" disabled={busy} onClick={() => handlers.onPutBack(skill)}>Put back version {skill.newestVersion}</Button>}
          {act.update && <Button size="sm" variant="secondary" disabled={busy} onClick={() => handlers.onUpdate(skill)}>Update…</Button>}
          {act.edit && <Link to={editPlaceSkillPath(skill.id)} className={LINK}>Edit</Link>}
        </div>
      )}
    </div>
  )
}
