export interface ProjectHeaderProps {
  name: string
  projectKey: string
  onNameChange?: (name: string) => void
  canEdit?: boolean
}

export function ProjectHeader({ name, projectKey, onNameChange, canEdit = true }: ProjectHeaderProps) {
  return (
    <div className="flex items-baseline gap-3 px-6 pt-6 pb-2">
      <span className="font-mono text-small bg-surface-3 px-1.5 py-0.5 rounded text-warning shrink-0">
        {projectKey}
      </span>
      {canEdit && onNameChange ? (
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="bg-transparent text-h1 font-semibold text-text-primary focus:outline-none"
        />
      ) : (
        <h1 className="text-h1 font-semibold text-text-primary">{name}</h1>
      )}
    </div>
  )
}
