import type { InstallPreview } from '../../install/types'

const LINE: Record<string, (i: InstallPreview['embedded'][number]) => string> = {
  new: i => `${i.title} ${i.version}`,
  restore: i => `${i.title} ${i.version}, brought back`,
  same: i => `${i.title} ${i.version}, shared, not copied`,
  update: i => `${i.title} ${i.version} (you have ${i.installedVersion}). Update offered after install`,
  older: i => `${i.title} (you have ${i.installedVersion}, which is newer; yours is kept)`,
  refused: i => i.reason ?? `${i.title} can't be installed`,
}

/**
 * What comes with a template (I6, board U4): its own role skills, the skills you already have (shared, not copied),
 * and the ones newer than yours (offered after install, never applied by themselves).
 */
export function TemplateBrings({ preview }: { preview: InstallPreview }) {
  const { embedded } = preview
  if (embedded.length === 0) return <p className="text-small text-text-secondary">It brings no skills.</p>
  const role = embedded.filter(e => e.name.includes('/') && e.outcome !== 'refused')
  const rest = embedded.filter(e => !role.includes(e))
  return (
    <div className="space-y-2 text-small text-text-secondary" data-testid="template-brings">
      <p className="text-body font-medium text-text-primary">It brings {embedded.length} skill{embedded.length === 1 ? '' : 's'}:</p>
      {role.length > 0 && (
        <p><strong className="text-text-primary">{role.length} for its role:</strong> {role.map(r => r.name.split('/')[1] ?? r.name).join(', ')}</p>
      )}
      {rest.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">
          {rest.map(i => <li key={i.identity}>{LINE[i.outcome]?.(i) ?? i.title}</li>)}
        </ul>
      )}
      <p>Installing the template doesn't add it to anyone. Create an agent from it, and that agent gets its role skills.</p>
    </div>
  )
}
