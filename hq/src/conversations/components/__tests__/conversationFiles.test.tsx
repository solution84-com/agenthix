// @vitest-environment jsdom
/**
 * A conversation's files (spec part 3, *Chips in conversations*, *Images in agents' replies*): its replies and its
 * person's messages show chips read in its place, Mention puts a chip in the message being written, and a chip opens
 * the file in the file viewer, "‹ Conversation" back, with the place's stable link.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { mentionInMessage } from '@agenthix/ui/sessions'

const ops = vi.hoisted(() => ({ openFile: vi.fn(), openFiles: vi.fn(), getSpeechToken: vi.fn(), useQuery: () => ({ data: undefined }), getFileFacts: 'getFileFacts', getTaskAttachments: 'getTaskAttachments', getProjects: 'getProjects' }))
vi.mock('wasp/client/operations', () => ops)
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, ChevronDown: icon, MoreHorizontal: icon }
})

import { createEmbedBatch } from '../../../shared/components/markdownEmbed/embedBatch'
import { EmbedBatchContext } from '../../../shared/components/markdownEmbed/useEmbedAnswer'
import { ChipFactsContext } from '../../../shared/components/markdownEmbed/useChipFacts'
import { ConversationFilesContext, type ConversationFiles } from '../conversationFiles'
import { ReplyBody } from '../ReplyBody'
import { PersonText } from '../PersonText'
import { MessageBox } from '../MessageBox'
import { readField } from '../messageFieldText'
import { MemoryRouter } from 'react-router'
import { ViewerFile } from '../../../storage/pages/viewer/ViewerFile'
import { conversationFileTarget, conversationTaskFileTarget } from '../conversationFiles'

const owner = { ownerType: 'user', ownerId: 'u1' } as const
const loc = { ...owner, workspaceId: null, taskId: null }

const pdf = (name: string, version: string) => ({ name, size: 10, version, contentType: 'application/pdf', kind: 'pdf' as const })
const ready = (name: string, version = '10:1'): FileOpenAnswer => ({
  state: 'ready', facts: pdf(name, version),
  previewLink: 'https://files.example.com/t/p', downloadLink: 'https://files.example.com/t/d', expiresAt: Date.now() + 300_000,
})

function inConversation(node: React.ReactNode) {
  const onOpen = vi.fn()
  const files: ConversationFiles = { owner, placePath: '/chat', onOpen, onOpenTaskFile: vi.fn() }
  const asked: SiteFileRef[] = []
  const changedVersion = `10:${Date.parse('2026-10-21T00:00:00Z')}`
  const batch = createEmbedBatch(async refs => { asked.push(...refs); return refs.map(() => ready('q3.pdf', changedVersion)) }, 0)
  const facts = createEmbedBatch(async refs => refs.map(() => ({ state: 'ready' as const, facts: pdf('q3.pdf', changedVersion) })), 0)
  render(
    <ConversationFilesContext.Provider value={files}>
      <EmbedBatchContext.Provider value={batch}>
        <ChipFactsContext.Provider value={facts}>{node}</ChipFactsContext.Provider>
      </EmbedBatchContext.Provider>
    </ConversationFilesContext.Provider>,
  )
  return { onOpen, asked }
}

afterEach(cleanup)

describe('a reply in a conversation @SC-1539', () => {
  it('reads the paths it writes in the conversation\'s place, and its chip opens the file', () => {
    const { onOpen } = inConversation(<ReplyBody text="The report is files/reports/q3.pdf." replyKey="t1" writtenAt="2026-10-20T00:00:00Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'reports/q3.pdf PDF' }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'reports/q3.pdf' })
  })

  it('says a file it names changed since it was written', async () => {
    inConversation(<ReplyBody text="See files/reports/q3.pdf now" replyKey="t1" writtenAt="2026-10-20T00:00:00Z" />)
    expect(await screen.findByText('Changed since this message')).toBeTruthy()
  })

  it('is drawn as before outside a conversation', () => {
    render(<ReplyBody text="The report is files/reports/q3.pdf." replyKey="t1" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('The report is files/reports/q3.pdf.')).toBeTruthy()
  })
})

describe('a person\'s message @SC-1539', () => {
  it('shows what Mention put in it as a chip, its words kept', () => {
    const { onOpen } = inConversation(<p><PersonText text="Can you check files/q3-data.pdf against last quarter?" /></p>)
    expect(screen.getByText(/Can you check/).textContent).toBe('Can you check q3-data.pdf PDF against last quarter?')
    fireEvent.click(screen.getByRole('button', { name: 'q3-data.pdf PDF' }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'q3-data.pdf' })
  })

  it('is plain text outside a conversation', () => {
    render(<p><PersonText text="files/q3-data.pdf" /></p>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Mention in the message being written @SC-1543', () => {
  const props = { placeholder: 'Message Kernel…', running: false, sending: false, onSend: vi.fn(async () => true), onStop: vi.fn() }

  it('puts the path in the box, shown there as a chip', () => {
    render(<MessageBox {...props} takesMentions />)
    let taken = false
    act(() => { taken = mentionInMessage('files/reports/q3-data.csv') })
    expect(taken).toBe(true)
    const field = screen.getByLabelText('Message Kernel…')
    expect(readField(field)).toBe('files/reports/q3-data.csv ')
    expect(within(field).getByRole('img', { name: 'q3-data.csv' }).textContent).toBe('q3-data.csv CSV')
  })

  it('is not claimed by a box that does not take mentions', () => {
    render(<MessageBox {...props} />)
    expect(mentionInMessage('files/a.md')).toBe(false)
    expect(readField(screen.getByLabelText('Message Kernel…'))).toBe('')
  })
})

describe('a file opened from a chip, in the file viewer @SC-1540', () => {
  beforeEach(() => {
    ops.openFile.mockResolvedValue(ready('q3.pdf'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
  })

  it('opens over the main area from the conversation, with ‹ Conversation back (C5)', () => {
    const ref: SiteFileRef = { space: 'place', loc, path: 'reports/q3.pdf' }
    expect(conversationFileTarget(ref, '/chat')).toEqual({ kind: 'file', ref, placePath: '/chat', from: { kind: 'conversation' } })
    expect(conversationTaskFileTarget({ taskId: 't1', taskKey: 'QR-1', loc: null, file: { kind: 'attachment', id: 'a1' } }))
      .toEqual({ kind: 'attachment', taskId: 't1', taskKey: 'QR-1', id: 'a1', from: { kind: 'conversation' } })
  })

  it('shows the file in the frame, and Copy link gives the place\'s stable link, not the conversation\'s', async () => {
    window.history.replaceState({}, '', '/chat/t/c1')
    const onBack = vi.fn()
    const target = conversationFileTarget({ space: 'place', loc, path: 'reports/q3.pdf' }, '/chat')!
    render(<MemoryRouter><ViewerFile target={target} back={{ label: 'Conversation', onBack }} onOpen={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(ops.openFile).toHaveBeenCalledWith({ file: { space: 'place', loc, path: 'reports/q3.pdf' } }))
    await screen.findByRole('link', { name: 'Download' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' })) })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/chat?tool=files&file=reports%2Fq3.pdf`)
    fireEvent.click(screen.getByRole('button', { name: 'Conversation' }))
    expect(onBack).toHaveBeenCalled()
    window.history.replaceState({}, '', '/')
  })
})
