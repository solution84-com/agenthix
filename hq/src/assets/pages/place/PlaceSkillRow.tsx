import { useNavigate } from 'react-router'
import { MoreMenu, type MenuItem } from '../../../org/components/menus'
import { editPlaceSkillPath } from './placeSkillRoutes'
import { primaryAction, rowActions, skillTitle, stateLine, switchedOffNote, type PlaceSkillView, type PlaceSkillsData, type RowAction } from './placeSkillsModel'
import { Switch, BUTTON_SECONDARY } from '@agenthix/ui/primitives'

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

const LINK = `shrink-0 rounded-lg px-3 py-1 text-small font-medium ${BUTTON_SECONDARY}`

const ACTION_LABEL: Record<RowAction, string> = { seeChange: 'See the change', publish: 'Publish…', update: 'Update…', read: 'Read' }

/** One skill of a place (boards, *A place's skills*): its name, its state in one sentence, at most one action, the switch, and ⋯ for the rest. */
export function PlaceSkillRow({ skill, may, busy, handlers }: { skill: PlaceSkillView; may: PlaceSkillsData['may']; busy: boolean; handlers: RowHandlers }) {
  const navigate = useNavigate()
  const act = rowActions(skill, may)
  const primary = primaryAction(skill, may)
  const title = skillTitle(skill)
  const on = skill.state === 'on'
  const run: Record<RowAction, () => void> = {
    seeChange: () => handlers.onChanges(skill),
    publish: () => handlers.onPublish(skill),
    update: () => handlers.onUpdate(skill),
    read: () => handlers.onRead(skill),
  }
  const menu: MenuItem[] = [
    ...(act.publish && primary !== 'publish' ? [{ label: 'Publish…', hint: 'As the next version', onSelect: run.publish }] : []),
    ...(act.putBack ? [{ label: `Put back version ${skill.newestVersion}`, hint: 'Replaces the files with the published ones', onSelect: () => handlers.onPutBack(skill) }] : []),
    ...(act.update && primary !== 'update' ? [{ label: 'Update…', hint: 'To the newer Library version', onSelect: run.update }] : []),
    ...(act.read && !act.changes && primary !== 'read' ? [{ label: 'Read the files', onSelect: run.read }] : []),
    ...(act.edit ? [{ label: 'Edit', onSelect: () => navigate(editPlaceSkillPath(skill.id)) }] : []),
    ...(act.history ? [{ label: 'Versions', hint: 'With Return to this version', onSelect: () => handlers.onHistory(skill) }] : []),
    ...(act.remove ? [{ label: 'Remove', hint: "Deletes the skill's folder", danger: true, separatorBefore: true, onSelect: () => handlers.onRemove(skill) }] : []),
  ]
  const switched = switchedOffNote(skill)
  const switchControl = act.switch ? (
    <Switch on={on} onChange={v => handlers.onSwitch(skill, v)} label={`${title} is ${on ? 'on' : 'off'}`} disabled={busy} />
  ) : null
  return (
    <div className={`border-t border-border-subtle py-3 first:border-t-0 ${skill.setAsideReason ? 'opacity-40' : ''}`} data-testid="place-skill-row">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-words text-body font-medium text-text-primary">{title}</div>
          {skill.description && <div className="text-small text-text-secondary">{skill.description}</div>}
          <div className="text-small text-text-muted" data-testid="place-skill-words">{stateLine(skill)}</div>
          {switched && <div className="text-small text-text-primary" data-testid="place-skill-switched-off">{switched}</div>}
          {skill.setAsideReason && <div className="text-small text-text-muted" data-testid="place-skill-note">{skill.setAsideReason}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {primary && <button type="button" className={LINK} disabled={busy} onClick={run[primary]}>{ACTION_LABEL[primary]}</button>}
          {switchControl}
          {menu.length > 0 && <MoreMenu items={menu} label={`More about ${title}`} />}
        </div>
      </div>
    </div>
  )
}
