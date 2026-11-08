// @vitest-environment jsdom
/**
 * Tasks, their files and folders named in a conversation (spec part 3, *Chips in conversations*): a task chip shows
 * its key, title and state and goes to the task; a task the person can't see stays plain text; a task's file opens
 * beside the thread; a folder is a folder chip that opens the Files tool there, with nothing signed for it.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'

vi.mock('wasp/client/operations', () => ({ openFile: vi.fn(), openFiles: vi.fn(), getFileFacts: vi.fn(), getTaskReferenceFacts: vi.fn() }))
// ui's frame draws icons from its own copy of lucide-react, which meets a second React here.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/files')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, MoreHorizontal: icon }
})

import { createEmbedBatch, createKeyedBatch } from '../../../shared/components/markdownEmbed/embedBatch'
import { EmbedBatchContext } from '../../../shared/components/markdownEmbed/useEmbedAnswer'
import { ChipFactsContext } from '../../../shared/components/markdownEmbed/useChipFacts'
import { TaskChipFactsContext } from '../../../shared/components/markdownEmbed/TaskChip'
import { writeTaskReference, type TaskReference } from '../../../shared/taskReferences'
import type { FileFactsAnswer } from '../../../files/fileFactsAnswer'
import type { TaskReferenceAnswer } from '../../../files/taskReferenceAnswer'
import { ConversationFilesContext, type ConversationFiles } from '../conversationFiles'
import { ReplyBody } from '../ReplyBody'
import { PersonText } from '../PersonText'

const owner = { ownerType: 'project', ownerId: 'p1' } as const
const task = { id: 't1', key: 'MOP-1', title: 'Fix the sign-up form', state: 'IN_PROGRESS' }
const taskLoc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: 't1' } as const
const png = { name: 'shot.png', size: 10, version: '10:1', contentType: 'image/png', kind: 'image' as const }

function taskAnswer(ref: TaskReference): TaskReferenceAnswer {
  if (ref.task !== 'MOP-1') return { state: 'not-found' }
  if (ref.kind === 'task') return { state: 'task', task }
  if (ref.kind === 'working') return { state: 'working', task, loc: taskLoc, path: ref.path, file: { state: 'ready', facts: { ...png, name: 'notes.md', kind: 'markdown', contentType: 'text/markdown' } } }
  return { state: 'attachment', task, attachmentId: 'att-1', file: { state: 'ready', facts: png } }
}

function inConversation(node: React.ReactNode, factsOf: (ref: SiteFileRef) => FileFactsAnswer = () => ({ state: 'folder' })) {
  const onOpen = vi.fn()
  const onOpenTaskFile = vi.fn()
  const files: ConversationFiles = { owner, placePath: '/projects/MOP', onOpen, onOpenTaskFile }
  const opened: SiteFileRef[] = []
  const factsAsked: SiteFileRef[] = []
  const batch = createEmbedBatch<FileOpenAnswer>(async refs => { opened.push(...refs); return refs.map(() => ({ state: 'not-found' })) }, 0)
  const facts = createEmbedBatch<FileFactsAnswer>(async refs => { factsAsked.push(...refs); return refs.map(factsOf) }, 0)
  const tasks = createKeyedBatch<TaskReference, TaskReferenceAnswer>(writeTaskReference, async refs => refs.map(taskAnswer), 0)
  render(
    <ConversationFilesContext.Provider value={files}>
      <EmbedBatchContext.Provider value={batch}>
        <ChipFactsContext.Provider value={facts}>
          <TaskChipFactsContext.Provider value={tasks}>{node}</TaskChipFactsContext.Provider>
        </ChipFactsContext.Provider>
      </EmbedBatchContext.Provider>
    </ConversationFilesContext.Provider>,
  )
  return { onOpen, onOpenTaskFile, opened, factsAsked }
}

afterEach(cleanup)

describe('a task named in a reply @SC-1541', () => {
  it('is a chip with its key, title and state that goes to the task', async () => {
    inConversation(<ReplyBody text="That is tasks/MOP-1." replyKey="t1" />)
    const chip = (await screen.findByText('Fix the sign-up form')).closest('a')!
    expect(chip.getAttribute('href')).toBe('/tasks/MOP-1')
    expect(chip.textContent).toContain('MOP-1')
    expect(chip.textContent).toContain('In progress')
  })

  it('stays plain text when the person may not see it, never showing a title', async () => {
    inConversation(<ReplyBody text="See tasks/SEC-1 too" replyKey="t1" />)
    expect(await screen.findByText('tasks/SEC-1')).toBeTruthy()
    expect(document.querySelector('a')).toBeNull()
  })

  it("opens an attachment beside the thread through the task's opening", async () => {
    const { onOpenTaskFile } = inConversation(<ReplyBody text="The screenshot: attachments/MOP-1/shot.png" replyKey="t1" />)
    fireEvent.click(await screen.findByRole('button', { name: /shot\.png/ }))
    expect(onOpenTaskFile).toHaveBeenCalledWith({ taskId: 't1', taskKey: 'MOP-1', loc: null, file: { kind: 'attachment', id: 'att-1' } })
  })

  it("opens a working file beside the thread in the task's folder", async () => {
    const { onOpenTaskFile, opened } = inConversation(<ReplyBody text="Notes in `tasks/MOP-1/notes.md` here" replyKey="t1" />)
    fireEvent.click(await screen.findByRole('button', { name: /notes\.md/ }))
    expect(onOpenTaskFile).toHaveBeenCalledWith({ taskId: 't1', taskKey: 'MOP-1', loc: taskLoc, file: { kind: 'working', path: 'notes.md' } })
    expect(opened).toEqual([])
  })

  it("is the same chip in a person's message", async () => {
    inConversation(<PersonText text="what about tasks/MOP-1?" />)
    expect((await screen.findByText('Fix the sign-up form')).closest('a')!.getAttribute('href')).toBe('/tasks/MOP-1')
  })
})

describe('a folder named in a conversation @SC-1542', () => {
  it('written with a trailing slash, is a folder chip that opens Files there, asking and opening nothing', async () => {
    const { factsAsked, opened } = inConversation(<ReplyBody text="Everything is in files/e2e-files/ now." replyKey="t1" />)
    const chip = await screen.findByRole('link', { name: /e2e-files/ })
    expect(chip.getAttribute('href')).toBe('/projects/MOP?tool=files&dir=e2e-files')
    expect(chip.textContent).toContain('Folder')
    expect(factsAsked).toEqual([])
    expect(opened).toEqual([])
  })

  it('written without one, is a folder chip once the site says it is a folder: never a gone file', async () => {
    inConversation(<ReplyBody text="Everything is in files/e2e-files now." replyKey="t1" />)
    const chip = await screen.findByRole('link', { name: /e2e-files/ })
    expect(chip.getAttribute('href')).toBe('/projects/MOP?tool=files&dir=e2e-files')
    expect(document.querySelector('[data-gone]')).toBeNull()
  })

  it('standing on its own line, falls back from the card to the folder chip', async () => {
    const { opened } = inConversation(<ReplyBody text={'Here:\n\nfiles/e2e-files\n\nDone.'} replyKey="t1" />)
    const chip = await screen.findByRole('link', { name: /e2e-files/ })
    expect(chip.getAttribute('href')).toBe('/projects/MOP?tool=files&dir=e2e-files')
    expect(opened.length).toBe(1)
  })

  it("in a person's message, written with a trailing slash, is the same folder chip", async () => {
    inConversation(<PersonText text="look in files/e2e-files/ please" />)
    expect((await screen.findByRole('link', { name: /e2e-files/ })).getAttribute('href')).toBe('/projects/MOP?tool=files&dir=e2e-files')
  })
})
