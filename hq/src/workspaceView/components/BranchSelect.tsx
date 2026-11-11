import { GitBranch, Loader, Lock, MessageSquare, Monitor } from 'lucide-react'
import type { BranchLineView } from '../../branches/views'
import { MAIN } from '../viewAddress'
import { VIEWER_UPDATE, branchDetails, canOpenBranchChat, originText } from '../words'
import { PREVIEW_STATE_LABEL } from '../livePreviewWords'
import { Dropdown } from './Dropdown'
import { ROW_CHOSEN, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'

export interface BranchListProps {
  main: { name: string; versionCount: number }
  branches: readonly BranchLineView[]
  /** `main`, or a branch's name. */
  chosen: string
  onChoose: (branch: string) => void
  /** Opens a branch's own chat: where it came from. */
  onOrigin: (line: BranchLineView) => void
  /** The signed-in person's id, to say *You*. */
  me?: string | null
  /** How many files the chosen branch changed, once read. */
  changes?: number | null
  /** Whether a branch's live preview is said: not while the live preview's flag is off. */
  livePreviews?: boolean
  canAct: boolean
}

/**
 * The branches, as the breadcrumb's branch ▾ and the phone's sheet list them: `main` first, then one line per branch
 * saying where it came from (a link to that chat), whose it is, what works on it, its changes, and how far behind
 * main it is when it is. There is no *New branch*: work makes its own.
 */
export function BranchList({ main, branches, chosen, onChoose, onOrigin, me = null, changes = null, livePreviews = true, canAct }: BranchListProps) {
  return (
    <div data-testid="branch-list">
      <ul aria-label="Branches" className="space-y-0.5">
        <li>
          <button type="button" aria-current={chosen === MAIN ? 'true' : undefined} onClick={() => onChoose(MAIN)}
            className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-small ${chosen === MAIN ? ROW_CHOSEN : ROW_ITEM}`}>
            <Lock size={14} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
            <span className="min-w-0">
              <span className="block font-mono font-medium text-text-primary">{main.name}</span>
              <span className="block text-micro text-text-muted" title="main changes only by merging a branch into it">Protected · version {main.versionCount}</span>
            </span>
          </button>
        </li>
        {branches.map(b => {
          const on = b.name === chosen
          const details = branchDetails(b, me, on ? changes : null)
          const preview = livePreviews && b.livePreview ? `Live preview ${PREVIEW_STATE_LABEL[b.livePreview.state].toLowerCase()}` : null
          return (
            <li key={b.id} className={`rounded-lg px-2 py-1.5 text-small ${on ? ROW_CHOSEN : ROW_ITEM}`}>
              <button type="button" aria-current={on ? 'true' : undefined} onClick={() => onChoose(b.name)} className="flex w-full items-center gap-2 text-left">
                <GitBranch size={14} aria-hidden className={`shrink-0 ${on ? 'text-text-primary' : 'text-text-muted'}`} />
                <span className="font-mono font-medium text-text-primary">{b.name}</span>
                {on && <span className="text-micro text-text-muted">open</span>}
              </button>
              {/* Wraps rather than cuts: the line ends with how far behind main it is. */}
              <p className="ml-6 break-words text-micro text-text-muted">
                from{' '}
                {canOpenBranchChat(b.whose, me) ? (
                  <button type="button" onClick={() => onOrigin(b)} className={`rounded inline-flex items-center gap-1 text-link hover:underline ${FOCUS_RING}`}
                    aria-label={`Open the chat ${b.name} came from: ${originText(b.whose, me)}`}>
                    {b.whose.kind === 'conversation' && <MessageSquare size={11} aria-hidden />}{originText(b.whose, me)}
                  </button>
                ) : <span data-testid="branch-origin-text">{originText(b.whose, me)}</span>}
                {details && <> · <span className={b.behind > 0 ? 'text-text-secondary' : undefined}>{details}</span></>}
                {preview && <span data-testid="branch-live-preview"> · <Monitor size={11} aria-hidden className="inline align-[-1px]" /> {preview}</span>}
              </p>
            </li>
          )
        })}
      </ul>
      {!canAct && <p className="px-2 pt-2 text-micro text-text-muted">{VIEWER_UPDATE}</p>}
    </div>
  )
}

/** The breadcrumb's branch ▾: the branch in view, ◌ while it is being brought up to date, and its list. */
export function BranchMenu(p: BranchListProps & { updating: boolean }) {
  const line = p.branches.find(b => b.name === p.chosen) ?? null
  const name = line?.name ?? p.main.name
  return (
    <Dropdown label={`Branch: ${name}`}
      button={(
        <>
          {line ? <GitBranch size={14} aria-hidden className="shrink-0 text-text-secondary" /> : <Lock size={14} aria-hidden className="shrink-0 text-text-muted" />}
          <span className="truncate font-mono font-medium">{name}</span>
          {p.updating && <Loader size={12} aria-label="Updating" className="shrink-0 animate-spin text-text-muted" />}
        </>
      )}>
      {close => <BranchList {...p} onChoose={b => { close(); p.onChoose(b) }} onOrigin={l => { close(); p.onOrigin(l) }} />}
    </Dropdown>
  )
}
