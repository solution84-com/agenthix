import { useEffect, useMemo, useState } from 'react'
import { X, Zap } from 'lucide-react'
import { useQuery, getUsedSkill } from 'wasp/client/operations'
import { needsFilesAddress, type FileOpenAnswer } from '@agenthix/core'
import { FileFrame, withMarkdown } from '@agenthix/ui/files'
import { renderMarkdownIn } from '../../shared/components/MarkdownMessage'
import { Beside } from '../../conversations/components/ShownViewer'
import type { UsedSkillRef } from './usedSkillOpener'
import { USED_SKILL_NOT_KEPT, USED_SKILL_NOT_PUBLISHED, type UsedSkillFileView, type UsedSkillView } from './usedSkillTypes'
import { ROW_CHOSEN, ROW_ITEM, DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { ReadFailure } from '@agenthix/ui/attention'

const LEVEL_WORDS: Record<UsedSkillView['level'], string> = { 'built-in': 'built in', installed: 'installed', place: 'files', yours: 'yours' }
/** The answer's links never need renewing: the bytes are already in the page. */
const NEVER = 8.64e15

function bytesOf(base64: string): Uint8Array {
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** One file of the version used, drawn by the file frame's renderers (adr-0155) from bytes hq sent. */
function UsedSkillFile({ file, base64, fingerprint }: { file: UsedSkillFileView; base64: string; fingerprint: string }) {
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytesOf(base64) as BlobPart], { type: file.contentType }))
    setLink(url)
    return () => URL.revokeObjectURL(url)
  }, [base64, file.contentType])
  const registry = useMemo(() => withMarkdown(renderMarkdownIn()), [])
  const name = file.path.split('/').pop() ?? file.path
  const answer = useMemo<FileOpenAnswer | undefined>(() => {
    if (!link) return undefined
    const facts = { name, size: file.size, version: `${fingerprint}:${file.path}`, contentType: file.contentType, kind: file.kind, ...(file.language ? { language: file.language } : {}) }
    return needsFilesAddress(file.kind)
      ? { state: 'no-files-address', facts, downloadLink: link, expiresAt: NEVER }
      : { state: 'ready', facts, previewLink: link, downloadLink: link, expiresAt: NEVER }
  }, [link, name, file, fingerprint])
  return (
    <div className="flex min-h-64 flex-1 flex-col">
      <FileFrame answer={answer} name={name} breadcrumb={file.path.split('/').slice(0, -1)} mode="opened" registry={registry} onReopen={() => undefined} />
    </div>
  )
}

function Tags({ view }: { view: UsedSkillView }) {
  const what = view.identity ?? view.path
  const by = view.publisher === null ? null : view.publisher === 'unsigned' ? 'Unsigned' : `By ${view.publisher}`
  return (
    <p className="text-micro text-text-muted" data-testid="used-skill-tags">
      {[view.where, LEVEL_WORDS[view.level], what, view.version, by].filter(Boolean).join(' · ')}
    </p>
  )
}

/**
 * A skill a conversation's work used, beside the thread (spec part 5 *Seeing it used*): at the version the run used,
 * its files drawn by the file frame, or — when HQ holds no copy of that version — that it isn't kept, with its
 * fingerprint. Access is checked by the query each time it opens.
 */
export function UsedSkillPanel({ conversationId, skill, onClose }: { conversationId: string; skill: UsedSkillRef; onClose: () => void }) {
  const [path, setPath] = useState<string | undefined>(undefined)
  const { data: view, error, isLoading, refetch } = useQuery(getUsedSkill, { conversationId, operationId: skill.operationId, name: skill.name, ...(path ? { path } : {}) })
  const title = view?.title ?? skill.name
  return (
    <Beside label={title} testId="used-skill-panel">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Zap size={14} aria-hidden className="shrink-0 text-text-muted" />
        <h2 className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className={`flex size-8 items-center justify-center rounded-lg text-text-muted max-lg:size-10 not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {error && <ReadFailure what="The skill" retry={() => void refetch()} />}
        {isLoading && !view && <p className="text-small text-text-muted">Loading…</p>}
        {view && (
          <>
            <Tags view={view} />
            <p className="text-small text-text-secondary">As the agent used it in this work.{view.newer && ` ${view.newer}`}</p>
            {view.kept ? (
              <>
                {view.kept.files.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Its files">
                    {view.kept.files.map((f) => (
                      <button key={f.path} type="button" aria-pressed={f.path === view.kept!.opened.path}
                        onClick={() => setPath(f.path)}
                        className={`rounded-lg border border-border-subtle px-2 py-0.5 text-micro ${f.path === view.kept!.opened.path ? ROW_CHOSEN : ROW_ITEM}`}>
                        {f.path}
                      </button>
                    ))}
                  </div>
                )}
                {(() => {
                  const opened = view.kept.files.find((f) => f.path === view.kept!.opened.path)
                  return opened && <UsedSkillFile key={`${view.fingerprint}:${opened.path}`} file={opened} base64={view.kept.opened.base64} fingerprint={view.fingerprint} />
                })()}
              </>
            ) : (
              <div role="status" className="rounded-lg border border-border-subtle px-3 py-2 text-small text-text-secondary" data-testid="used-skill-not-kept">
                <p>{USED_SKILL_NOT_KEPT}{(view.level === 'place' || view.level === 'yours') && view.path ? ` ${USED_SKILL_NOT_PUBLISHED}` : ''}</p>
                <p className="mt-1 break-all font-mono text-micro text-text-muted">Fingerprint {view.fingerprint}</p>
              </div>
            )}
            {view.openHref && <a href={view.openHref} className={`rounded inline-block text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Open in the Library →</a>}
          </>
        )}
      </div>
    </Beside>
  )
}
