import { NativeSelect } from '../primitives'

export interface ProjectOption {
  projectId: string
  siteId: string
  name: string
  projectKey: string
  siteName: string
}

export interface ProjectPickerProps {
  projects: ProjectOption[]
  value: string                  // projectId
  onChange: (selected: { projectId: string; siteId: string } | null) => void
  label?: string
  required?: boolean
  helperText?: string
}

export function ProjectPicker({
  projects, value, onChange, label = 'Project', required, helperText,
}: ProjectPickerProps) {
  if (projects.length === 0) {
    return (
      <div className="space-y-1">
        <span className="text-small text-text-secondary">{label}</span>
        <p className="text-small text-text-muted italic">No projects available</p>
      </div>
    )
  }

  const bySite = projects.reduce<Record<string, ProjectOption[]>>((acc, p) => {
    ;(acc[p.siteName] ??= []).push(p)
    return acc
  }, {})

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value
    if (!projectId) { onChange(null); return }
    const found = projects.find(p => p.projectId === projectId)
    if (found) onChange({ projectId: found.projectId, siteId: found.siteId })
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <span className="text-small text-text-secondary block mb-1">
          {label}{required && <span className="text-danger/70 ml-1">*</span>}
        </span>
        <NativeSelect value={value} onChange={handleChange} required={required}>
          {!value && <option value="">Select a project…</option>}
          {Object.entries(bySite).map(([siteName, siteProjects]) => (
            <optgroup key={siteName} label={siteName}>
              {siteProjects.map(p => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectKey} — {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </label>
      {helperText && <p className="text-small text-text-muted">{helperText}</p>}
    </div>
  )
}
