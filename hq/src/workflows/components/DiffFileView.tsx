import { withContext } from '../pages/compareVersions'
import type { FileDiff } from '../versionDiff'

const LINE_CLASS = { same: 'text-text-secondary', added: 'bg-success/10 text-text-primary', removed: 'bg-danger/10 text-text-primary', gap: 'text-text-muted' } as const
const MARK = { same: ' ', added: '+', removed: '-' } as const

/** One file of a comparison: its lines with changes marked, the unchanged ones far from a change folded away. */
export function DiffFileView({ file }: { file: FileDiff }) {
  const change = file.change === 'same' ? 'unchanged' : file.change
  return (
    <section className="space-y-1" data-testid="diff-file">
      <h4 className="text-small font-medium text-text-primary">{file.path} <span className="font-normal text-text-muted">· {change}{file.modeChanged ? ', permissions changed' : ''}</span></h4>
      {file.lines ? (
        <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-surface-1 py-1 font-mono text-micro">
          {withContext(file.lines).map((l, i) => l.kind === 'gap'
            ? <span key={i} className={`block px-2 ${LINE_CLASS.gap}`}>… {l.hidden} unchanged lines</span>
            : <span key={i} className={`block whitespace-pre-wrap break-all px-2 ${LINE_CLASS[l.kind]}`}>{MARK[l.kind]} {l.text}</span>)}
        </pre>
      ) : (
        <p className="text-small text-text-muted">{file.binary ? 'Not a text file, so its lines are not shown.' : file.change === 'same' ? 'Nothing changed in this file.' : 'Too large to compare line by line.'}</p>
      )}
    </section>
  )
}
