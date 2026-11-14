import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { useQuery, getWorkspaceRefusal } from 'wasp/client/operations'
import { copyText, COPY_FAILED_WORDS } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { WorkspaceRefusalView } from '../../branches/views'
import { possessive } from '../words'
import { ReadNudgesHeld, ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

const HOME = { href: '/', label: 'Home' }
const projectHref = (key: string) => `/projects/${encodeURIComponent(key)}`

/** The status of a refused read, when it is one. */
export const statusOf = (error: unknown): number | null => {
  const code = typeof error === 'object' && error !== null ? (error as { statusCode?: unknown }).statusCode : null
  return typeof code === 'number' ? code : null
}

/** A read that cannot change by asking again: not there, or not the person's to read. */
export const isRefused = (error: unknown): boolean => { const s = statusOf(error); return s === 403 || s === 404 }

/**
 * The page in place of the view when a workspace cannot be opened: what is wrong, who can fix it, and a way back,
 * never an endless *Loading…*. It names the project only when hq says the person may see that it exists.
 */
export function CantOpenWorkspace({ workspaceId, onRetry }: { workspaceId: string; onRetry?: () => void }) {
  // Read by the one quiet-retry policy, so a passing failure is not said at once.
  const { data, error, refetch } = useQuery(getWorkspaceRefusal, { workspaceId })
  const held = useContext(ReadNudgesHeld)
  // While the frame line says HQ is not answering, a read that failed says nothing of its own: the one cause is said once.
  if (error && held && !isRefused(error)) return <CantOpenPage back={HOME} title="Opening the workspace…" lines={[]} />
  if (error) {
    const retry = () => { void refetch(); onRetry?.() }
    return <CantOpenPage back={HOME} title="This workspace can't be opened right now" lines={[`${pressFailureWords(error)} Nothing was changed.`]} retry={retry} />
  }
  const why = data as WorkspaceRefusalView | undefined
  if (!why) return <CantOpenPage back={HOME} title="Opening the workspace…" lines={[]} />
  if (why.reason === 'gone') {
    return <CantOpenPage back={HOME} title="This workspace isn't here any more" lines={["It may have been deleted or moved. Each project's workspaces are listed in the project."]} />
  }
  if (why.reason === 'open') {
    // It can be read after all (access given meanwhile): a reload opens it.
    return <CantOpenPage back={HOME} title="This workspace can be opened now" lines={['Reload the page to open it.']} />
  }
  const project = why.project
  return (
    <CantOpenPage back={project ? { href: projectHref(project.key), label: project.name } : HOME} title="You can't open this workspace" copyLink
      lines={project
        ? [<>It belongs to the project <b className="text-text-primary">{project.name}</b>, and you are not a member of it.</>, 'Ask an admin of the project to add you. Nothing was changed.']
        : ['It belongs to a project you are not a member of, or to someone else’s own files.', 'Ask whoever shared the link to add you. Nothing was changed.']} />
  )
}

/** A workspace that opened but whose branches could not be read: why, and the way back to its place. */
export function CantReadBranches({ message, back, onRetry }: { message: string; back: { href: string; label: string }; onRetry?: () => void }) {
  const held = useContext(ReadNudgesHeld)
  if (held) return <CantOpenPage back={back} title="Opening the workspace…" lines={[]} />
  return <CantOpenPage back={back} title="This workspace can't be shown right now" lines={[message]} link={{ href: back.href, label: `${possessive(back.label)} workspaces` }} retry={onRetry} />
}

function CantOpenPage({ back, title, lines, copyLink = false, link, retry }: {
  back: { href: string; label: string }
  title: string
  lines: ReactNode[]
  copyLink?: boolean
  link?: { href: string; label: string }
  /** A failure asking again may mend: Try again. A final answer has none. */
  retry?: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async () => {
    setCopied((await copyText(window.location.href)) ? 'copied' : COPY_FAILED_WORDS)
  }
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-surface-0 text-text-primary" data-testid="workspace-cant-open">
      <header className="flex h-11 shrink-0 items-center border-b border-border-subtle bg-surface-1 px-3">
        <Link to={back.href} className="flex items-center gap-1 text-small font-medium text-text-secondary hover:text-text-primary">
          <ChevronLeft size={15} aria-hidden />{back.label}
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        <section aria-labelledby="cant-open-title" className="w-full max-w-md space-y-3 rounded-xl border border-border-subtle bg-surface-1 p-6 text-small text-text-secondary">
          <h1 id="cant-open-title" className="text-h2 font-medium text-text-primary">{title}</h1>
          {lines.map((l, i) => <p key={i}>{l}</p>)}
          <div className="flex flex-wrap gap-2 pt-2">
            {retry && <button type="button" className={FILES_BUTTON_PRIMARY} onClick={retry}>Try again</button>}
            <Link to={(link ?? back).href} className={retry ? FILES_BUTTON : FILES_BUTTON_PRIMARY}>{link ? link.label : `Back to ${back.label}`}</Link>
            {copyLink && <button type="button" className={FILES_BUTTON} onClick={() => void copy()}>{copied === 'copied' ? 'Link copied' : 'Copy this link'}</button>}
          </div>
          {copied === COPY_FAILED_WORDS && <ShowAttention kind="alert" text={COPY_FAILED_WORDS} title="Not copied" />}
        </section>
      </main>
    </div>
  )
}
