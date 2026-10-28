import { useQuery, getPackageFiles } from 'wasp/client/operations'
import type { PackageFrom } from './packageSource'

/**
 * The files of a package not yet installed, as plain text (D26): what a person reads before ticking *I've read it*.
 * Drawn as text and nothing else, so nothing in the package can act on the page.
 */
export function ReadPackage({ source }: { source: PackageFrom }) {
  const { data, error, isLoading } = useQuery(getPackageFiles, source)
  if (error) return <p role="alert" className="text-small text-danger">{error.message}</p>
  if (isLoading || !data) return <p className="text-small text-text-muted">Loading…</p>
  return (
    <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border-subtle p-3" data-testid="read-package">
      {data.files.map(f => (
        <div key={f.path}>
          <p className="font-mono text-micro text-text-muted">{f.path}</p>
          {f.text !== null
            ? <pre className="whitespace-pre-wrap break-words text-small text-text-primary">{f.text}</pre>
            : <p className="text-small text-text-secondary">Not shown: {f.size} bytes, not text or too large to read here.</p>}
        </div>
      ))}
      {data.more > 0 && <p className="text-small text-text-secondary">{data.more} more files are not shown.</p>}
    </div>
  )
}
