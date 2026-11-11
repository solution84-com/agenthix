import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronLeft, ChevronRight, EllipsisVertical, GitBranch, Lock, MessageSquare } from 'lucide-react'
import { DockLayer } from '../../dock/DockLayer'
import { DockPhoneButton } from '../../dock/DockPhoneButton'
import type { FrameParts } from './WorkspaceFrame'
import { WorkspaceList } from './TopBar'
import { PhonePersonRows } from './PhonePersonRows'
import { DISABLED, FOCUS_RING, FOCUS_RING_INSET, ROW_ITEM, BUTTON_GHOST } from '@agenthix/ui/primitives'

type Sheet = 'branches' | 'versions' | 'menu' | 'workspaces'

/** The line under a running live preview on a phone while its agent works (board `narrow-phone`). */
export const phonePreviewLine = (agentName: string | null) => `${agentName ?? 'The agent'} is working · reloads when it saves`

const SHEET_ROW = `flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-body ${ROW_ITEM} ${FOCUS_RING_INSET}`

/**
 * The view on a phone: the title is the workspace, with the branch (or main and its version) under it, which opens a
 * sheet of branches or of main's versions. 💬 is the app's phone chat; ⋮ holds the branch's own chat, switching
 * workspace and About. The tree is full width, a file opens on its own screen, and the next step is the button at the foot.
 */
export function PhoneFrame(p: FrameParts) {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const done = () => setSheet(null)
  const line = p.top.phoneLine
  const previewShown = p.section === 'preview' && p.git && !!p.preview

  if (p.middleShown && !previewShown) {
    // A file on its own screen, with its own header and foot.
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-1 text-text-primary" data-testid="workspace-view" data-size="phone">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">{p.middle('narrow')}</div>
        {p.top.dialogs}
      </div>
    )
  }

  const icon = line.opens === 'branches' ? <GitBranch size={12} aria-hidden /> : line.opens === 'versions' ? <Lock size={12} aria-hidden /> : null
  const sub = `${line.text}${line.readOnly ? ' · read-only' : ''}`
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-1 text-text-primary" data-testid="workspace-view" data-size="phone">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border-subtle px-2" data-testid="workspace-top">
        <Link to={p.back.href} aria-label={`Back to ${p.back.label}`} className={`flex h-9 w-9 items-center justify-center rounded-lg ${BUTTON_GHOST}`}>
          <ChevronLeft size={18} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{p.workspaceName}</p>
          {line.opens ? (
            <button type="button" onClick={() => setSheet(line.opens)} aria-label={line.opens === 'branches' ? `Branch: ${line.text}` : `Version: ${line.text}`}
              className={`flex max-w-full items-center gap-1 text-micro ${line.readOnly ? 'text-warning' : 'text-text-secondary'}`}>
              {icon}<span className="truncate">{sub}</span><ChevronDown size={12} aria-hidden className="shrink-0" />
            </button>
          ) : <p className="text-micro text-text-muted">{sub}</p>}
        </div>
        <DockPhoneButton />
        <button type="button" aria-label="More" title="More" onClick={() => setSheet('menu')}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`}>
          <EllipsisVertical size={18} aria-hidden />
        </button>
      </header>
      {p.top.note}
      {previewShown ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col">{p.preview?.('narrow')}</div>
          {p.previewState === 'running' && p.working && (
            <p role="status" className="flex shrink-0 items-center gap-1.5 border-t border-border-subtle px-3 py-1.5 text-micro text-text-secondary" data-testid="phone-preview-footer">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
              {phonePreviewLine(p.working)}
            </p>
          )}
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">{p.filesBody}</div>
      )}
      <Foot>{p.top.footNext}</Foot>
      {sheet === 'branches' && <PhoneSheet label="Branches" onClose={done}>{p.top.branchList(done)}</PhoneSheet>}
      {sheet === 'versions' && (
        <PhoneSheet label="Versions of main" onClose={done}>
          {p.top.versionList(done)}
          <button type="button" className={SHEET_ROW} onClick={() => setSheet('branches')}>Switch branch…</button>
        </PhoneSheet>
      )}
      {sheet === 'workspaces' && (
        <PhoneSheet label="Switch workspace" onClose={done} onBack={() => setSheet('menu')}>
          <WorkspaceList name={p.workspaceName} workspaces={p.workspaces} onChosen={done} />
        </PhoneSheet>
      )}
      {sheet === 'menu' && (
        <PhoneSheet label={p.workspaceName} onClose={done}>
          {p.top.openChat && <button type="button" className={SHEET_ROW} onClick={() => { done(); p.top.openChat?.() }}>Open this branch’s chat</button>}
          {p.top.blockedChat && (
            <div className="px-3 py-2.5" data-testid="blocked-chat">
              <button type="button" aria-disabled="true" aria-describedby="blocked-chat-why" className="flex w-full cursor-not-allowed items-center gap-2 text-left text-body text-text-muted">
                <MessageSquare size={14} aria-hidden /> {p.top.blockedChat.label}
              </button>
              <p id="blocked-chat-why" className="mt-1 text-micro text-text-muted">{p.top.blockedChat.why}</p>
            </div>
          )}
          {p.git && p.preview && (
            <button type="button" className={SHEET_ROW} onClick={() => { done(); p.onSection(previewShown ? 'files' : 'preview') }}>
              {previewShown ? 'Files' : 'Live preview'}
            </button>
          )}
          <button type="button" className={SHEET_ROW} onClick={() => setSheet('workspaces')}>
            <span className="flex-1 font-medium">Switch workspace</span>
            <span className="text-small text-text-muted">{p.workspaceName}</span><ChevronRight size={14} aria-hidden className="text-text-muted" />
          </button>
          <button type="button" className={SHEET_ROW} onClick={() => { done(); p.top.onAbout() }}>About this workspace</button>
          <PhonePersonRows rowClass={SHEET_ROW} onDone={done} />
        </PhoneSheet>
      )}
      {p.top.dialogs}
    </div>
  )
}

function Foot({ children }: { children: ReactNode }) {
  if (!children) return null
  return <div className="flex shrink-0 gap-2 border-t border-border-subtle bg-surface-1 p-2" data-testid="phone-foot">{children}</div>
}

function PhoneSheet({ label, onClose, onBack, children }: { label: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  return (
    <DockLayer label={label} heading={label} narrow onClose={onClose} onBack={onBack}>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">{children}</div>
    </DockLayer>
  )
}
