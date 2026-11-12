import { useNavigate } from 'react-router'
import { useAction, updateProject } from 'wasp/client/operations'
import { ProjectLeadField } from '../ProjectLeadField'
import { Part, ReadOnlyValue, TextPart } from './Part'
import { keyProblem, keyState } from './settingsRights'
import type { SettingsProject } from './types'

/**
 * Name, key, description and lead: the project's own fields, its admins'. A personal project has no lead. Your space
 * keeps its name and shows no key: only its description changes.
 */
export function AboutSection({ project, canEdit, personal, space = false }: { project: SettingsProject; canEdit: boolean; personal: boolean; space?: boolean }) {
  const navigate = useNavigate()
  const update = useAction(updateProject)
  const key = keyState(project.tasks.length, project.key)
  const description = (
    <TextPart
      label="Description" id="set-desc" value={project.description ?? ''} canEdit={canEdit} multiline
      placeholder={space ? 'What your space is for' : 'What this project is for'} emptyText="No description"
      onSave={description => update({ projectId: project.id, description })}
    />
  )

  if (space) {
    return (
      <div className="space-y-4">
        <Part label="Name" htmlFor="set-name">
          <ReadOnlyValue id="set-name">Your space</ReadOnlyValue>
          <div className="text-micro text-text-muted">Your space can't be renamed</div>
        </Part>
        {description}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TextPart
        label="Name" id="set-name" value={project.name} canEdit={canEdit}
        validate={next => (next ? null : 'A project needs a name')}
        onSave={name => update({ projectId: project.id, name })}
      />
      {key.locked ? (
        <Part label="Key" htmlFor="set-key">
          <ReadOnlyValue id="set-key" mono>{project.key}</ReadOnlyValue>
          <div className="text-micro text-text-muted">{key.reason}</div>
        </Part>
      ) : (
        <TextPart
          label="Key" id="set-key" value={project.key} canEdit={canEdit} mono
          normalize={raw => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6)}
          validate={keyProblem}
          hint={`2 to 6 letters, used in task numbers (${project.key}-1). Fixed once the first task exists.`}
          onSave={async next => {
            await update({ projectId: project.id, key: next })
            navigate(`/projects/${next}?tool=settings`, { replace: true })
          }}
        />
      )}
      {description}
      {!personal && <ProjectLeadField projectId={project.id} lead={project.lead} canEdit={canEdit} />}
    </div>
  )
}
