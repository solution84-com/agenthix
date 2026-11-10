// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import type { FileOpenAnswer } from '@agenthix/core'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../MarkdownMessage'
import { OpenAttachmentContext, type OpenAttachment } from '../attachmentEmbed'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/files')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, MoreHorizontal: icon }
})

const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: 't1' } as const
const embed: MarkdownEmbedContext = {
  place: { space: 'place', loc, siblings: { ownerType: 'project', ownerId: 'p1' }, task: { id: 't1', key: 'AGX-7' } }, folder: '',
}

function ready(name: string): FileOpenAnswer {
  const image = name.endsWith('.png')
  return {
    state: 'ready',
    facts: { name, size: 2048, version: 'v1', contentType: image ? 'image/png' : 'application/pdf', kind: image ? 'image' : 'pdf' },
    previewLink: `https://hq.example.com/t/preview.${name}`, downloadLink: `https://hq.example.com/t/download.${name}`,
    expiresAt: Date.now() + 300_000,
  }
}

function setup(content: string, context: MarkdownEmbedContext = embed) {
  const asked: [string, string][] = []
  const open: OpenAttachment = async (taskId, fileName) => {
    asked.push([taskId, fileName])
    return fileName.includes('gone') ? { state: 'not-found' } : { ...ready(fileName), attachmentId: `att-${fileName}` }
  }
  const view = render(
    <OpenAttachmentContext.Provider value={open}><MarkdownMessage content={content} embed={context} /></OpenAttachmentContext.Provider>,
  )
  return { ...view, asked }
}

afterEach(cleanup)

describe("a task's own attachments in its text @SC-1556", () => {
  it('draws attachments/<its key>/<image> inline, opened through hq', async () => {
    const { container, asked } = setup('![shot](attachments/AGX-7/shot.png)')
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://hq.example.com/t/preview.shot.png')
    expect(asked).toEqual([['t1', 'shot.png']])
  })

  it('draws an image tag naming one the same way', async () => {
    const { container } = setup('<img src="attachments/AGX-7/shot.png" width="120">')
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('width')).toBe('120'))
  })

  it("shows an attachment hq doesn't find, or the person may not open, as a broken image", async () => {
    setup('![](attachments/AGX-7/gone.png)')
    await waitFor(() => expect(screen.getByRole('img', { name: /^gone\.png can't be shown: .*isn't there$/ })).toBeTruthy())
  })

  it("never asks for another task's attachment: it is shown as outside", async () => {
    const { asked } = setup('![](attachments/AGX-8/shot.png)')
    expect(screen.getByRole('img', { name: "shot.png can't be shown: attachments/AGX-8/shot.png is outside this place, so it isn't shown" })).toBeTruthy()
    await new Promise(r => setTimeout(r, 5))
    expect(asked).toEqual([])
  })

  it('draws a link to one alone on its line as a card', async () => {
    const { container } = setup('[the spec](attachments/AGX-7/spec.pdf)')
    await waitFor(() => expect(container.querySelector('[data-embed="card"]')?.textContent).toContain('spec.pdf'))
  })
})

describe("a click on a task's embedded attachment", () => {
  it('opens the image beside the task', async () => {
    const onOpenTaskFile = vi.fn()
    setup('![shot](attachments/AGX-7/shot.png)', { ...embed, onOpenTaskFile })
    fireEvent.click(await screen.findByRole('button', { name: 'Open shot.png' }))
    expect(onOpenTaskFile).toHaveBeenCalledWith({ taskId: 't1', taskKey: 'AGX-7', loc: null, file: { kind: 'attachment', id: 'att-shot.png' } })
  })

  it('draws the image with nothing to click where the screen opens nothing beside', async () => {
    const { container } = setup('![shot](attachments/AGX-7/shot.png)')
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Open shot.png' })).toBeNull()
  })
})
