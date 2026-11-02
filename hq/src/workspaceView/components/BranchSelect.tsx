import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, GitBranch, Lock, Monitor } from 'lucide-react'
import type { BranchLineView } from '../../branches/views'
import { MAIN } from '../viewAddress'
import { agentOf, aheadText, branchSubLine, whoseLabel } from '../words'
import { PREVIEW_STATE_LABEL } from '../livePreviewWords'

/**
 * The branch select (spec part 1, *Layout* 2): it sets the branch for everything in the view. Opened, it lists
 * `main` first, then one line per branch: its name, whose work it is, what is working on it, how far ahead and
 * behind `main`. There is no *New branch*: work makes its own.
 */
export function BranchSelect({ main, branches, chosen, onChoose, me = null, compact = false, livePreviews = true }: {
  main: { name: string; versionCount: number }
  branches: readonly BranchLineView[]
  /** `main`, or a branch's name. */
  chosen: string
  onChoose: (branch: string) => void
  /** The signed-in person's id, to say *You*. */
  me?: string | null
  /** Drawn as an icon only (the left panel's strip). */
  compact?: boolean
  /** Whether a branch's live preview is said: not while the live preview's flag is off. */
  livePreviews?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const line = branches.find(b => b.name === chosen) ?? null
  const isMain = chosen === MAIN || !line
  const name = isMain ? main.name : line.name
  const sub = isMain ? `Protected · version ${main.versionCount}` : branchSubLine(line, me)
  const choose = (b: string) => { setOpen(false); onChoose(b) }

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Branch: ${name}`} title={compact ? `Branch: ${name}` : undefined}
        onClick={() => setOpen(o => !o)}
        className={compact
          ? 'flex h-9 w-9 items-center justify-center rounded-lg text-accent hover:bg-surface-hover'
          : 'flex w-full items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left hover:border-accent'}>
        {isMain ? <Lock size={15} aria-hidden className="shrink-0 text-text-muted" /> : <GitBranch size={15} aria-hidden className="shrink-0 text-accent" />}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-small font-semibold text-text-primary">{name}</span>
              <span className="block truncate text-micro text-text-muted">{sub}</span>
            </span>
            <ChevronDown size={15} aria-hidden className="shrink-0 text-text-muted" />
          </>
        )}
      </button>
      {open && (
        <div className={`absolute z-40 mt-1 w-[26rem] max-w-[90vw] rounded-xl border border-border bg-surface-1 p-2 shadow-xl ${compact ? 'left-full top-0 ml-1' : 'left-0'}`}>
          <p className="px-2 pb-2 text-micro text-text-secondary">Each branch has its own working copy, like a git worktree. Agents make the changes; you review and merge.</p>
          <ul role="listbox" aria-label="Branches">
            <Option on={isMain} onChoose={() => choose(MAIN)} icon={<Lock size={14} aria-hidden className="text-text-muted" />}
              name={main.name} whose="Protected" state={null} right={`version ${main.versionCount}`} />
            {branches.map(b => (
              <Option key={b.id} on={b.name === chosen} onChoose={() => choose(b.name)} icon={<GitBranch size={14} aria-hidden className={b.name === chosen ? 'text-accent' : 'text-text-muted'} />}
                name={b.name} whose={whoseLabel(b.whose, agentOf(b), me)}
                state={b.working ? `${b.working.agentName} is working here` : null}
                preview={livePreviews && b.livePreview ? `Live preview ${PREVIEW_STATE_LABEL[b.livePreview.state].toLowerCase()}` : null}
                right={aheadText(b.ahead, b.behind)} warn={b.behind > 0} />
            ))}
          </ul>
          <p className="px-2 pt-2 text-micro text-text-muted">A conversation or task on this workspace makes its own branch.</p>
        </div>
      )}
    </div>
  )
}

function Option({ on, onChoose, icon, name, whose, state, preview = null, right, warn = false }: {
  on: boolean
  onChoose: () => void
  icon: ReactNode
  name: string
  whose: string
  state: string | null
  /** The branch's live preview while it is live: "Live preview running". */
  preview?: string | null
  right: string
  warn?: boolean
}) {
  return (
    <li role="option" aria-selected={on}>
      <button type="button" onClick={onChoose}
        className={`grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2 py-1.5 text-left text-small hover:bg-surface-hover ${on ? 'bg-accent-subtle' : ''}`}>
        {icon}
        <span className="min-w-0">
          <span className="block truncate font-mono font-semibold text-text-primary">{name}</span>
          <span className="block truncate text-micro text-text-muted">
            {whose}{state && <span className="text-success"> · ● {state}</span>}
            {preview && <span className="text-text-secondary" data-testid="branch-live-preview"> · <Monitor size={11} aria-hidden className="inline align-[-1px]" /> {preview}</span>}
          </span>
        </span>
        <span className={`text-micro ${warn ? 'text-warning' : 'text-text-secondary'}`}>{right}</span>
      </button>
    </li>
  )
}
