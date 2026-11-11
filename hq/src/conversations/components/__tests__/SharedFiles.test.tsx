// @vitest-environment jsdom
/**
 * Photos and files in the message box (conversation's design, *Photos and files*): pasted or dropped onto the box,
 * shown in its tray with ✕, sent with no words, a model known to read text only named with a switch, and shown in
 * the person's message after with the note when the model could not see them.
 */
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { ModelChoice, ModelChoices, SharedFile } from '@agenthix/core'

vi.mock('wasp/client/operations', () => ({ getSpeechToken: vi.fn() }))

import { MessageBox, type MessageBoxVoice } from '../MessageBox'
import { SharedTray } from '../SharedTray'
import { textOnlyModel } from '../sharedWarning'
import { PersonBubble } from '../MessageItem'
import { mayBeShared, TOO_MANY, useSharedFiles } from '../../hooks/useSharedFiles'

afterEach(cleanup)
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

const voice: MessageBoxVoice = {
  available: true, reason: null, heldByOther: false, inVoice: false, speaker: 'none', muted: false,
  onStart: vi.fn(), onEnd: vi.fn(), onMute: vi.fn(),
}
const png = (name = 'shot.png', size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' })

describe('the message box takes files', () => {
  it('hands on files pasted or dropped onto it, and draws the tray above the text', () => {
    const onFiles = vi.fn()
    render(<MessageBox placeholder="Message Kernel…" running={false} sending={false} onSend={vi.fn()} onStop={vi.fn()} voice={voice}
      onFiles={onFiles} tray={<div data-testid="the-tray" />} />)
    const pill = screen.getByTestId('message-pill')
    expect(pill.firstElementChild?.getAttribute('data-testid')).toBe('the-tray')
    const file = png()
    fireEvent.paste(pill, { clipboardData: { files: [file], getData: () => '' } })
    fireEvent.drop(pill, { dataTransfer: { files: [file], types: ['Files'], getData: () => '' } })
    expect(onFiles).toHaveBeenCalledTimes(2)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it('sends with no words once something was added', async () => {
    const onSend = vi.fn(async () => true)
    render(<MessageBox placeholder="Message Kernel…" running={false} sending={false} onSend={onSend} onStop={vi.fn()} voice={voice} hasShared />)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith(''))
  })
})

describe('the tray', () => {
  it('takes photos, PDFs and text, refusing anything else and anything too large, and at most six', () => {
    expect(mayBeShared({ name: 'a.png', type: 'image/png' })).toBe('image')
    expect(mayBeShared({ name: 'notes.md', type: '' })).toBe('file')
    expect(mayBeShared({ name: 'a.zip', type: 'application/zip' })).toBeNull()
    expect(mayBeShared({ name: 'a.heic', type: 'image/heic' })).toBeNull()

    const { result } = renderHook(() => useSharedFiles('c1', vi.fn()))
    act(() => result.current.add([png(), new File(['x'], 'a.zip', { type: 'application/zip' })]))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.notice).toMatch(/^a\.zip can't be added: photos \(PNG, JPEG, GIF or WebP\), PDFs and text files, up to 10 MB each\.$/)
    act(() => result.current.add(Array.from({ length: 6 }, (_, i) => png(`s${i}.png`))))
    expect(result.current.items).toHaveLength(6)
    expect(result.current.notice).toBe(TOO_MANY)
  })

  it('keeps each file once when Send is pressed, and says why when one could not be kept', async () => {
    const kept: SharedFile = { name: 'shot.png', kind: 'image', mime: 'image/png', size: 10 }
    const share = vi.fn()
      .mockResolvedValueOnce(kept)
      .mockRejectedValueOnce(new Error("The place's Execution Site couldn't keep it."))
      .mockResolvedValueOnce({ ...kept, name: 'two.png' })
    const { result } = renderHook(() => useSharedFiles('c1', share))
    act(() => result.current.add([png(), png('two.png')]))
    let files: SharedFile[] | null = []
    await act(async () => { files = await result.current.keepAll() })
    expect(files).toBeNull()
    expect(result.current.items.map(i => i.state)).toEqual(['kept', 'failed'])
    await act(async () => { files = await result.current.keepAll() })
    expect(files).toEqual([kept, { ...kept, name: 'two.png' }])
    expect(share).toHaveBeenCalledTimes(3)
    expect(share.mock.calls[0][0]).toMatchObject({ conversationId: 'c1', name: 'shot.png', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) })
  })

  it('shows a thumbnail with ✕, greyed with a reason and a switch when the model reads text only', () => {
    const { result } = renderHook(() => useSharedFiles('c1', vi.fn()))
    act(() => result.current.add([png()]))
    const onSwitch = vi.fn()
    render(<SharedTray shared={result.current} textOnly={{ modelLabel: 'DeepSeek Pro', agentName: 'Writer', switchTo: { label: 'DeepSeek Flash', onSwitch } }} />)
    expect(screen.getByRole('img', { name: 'shot.png' })).toBeTruthy()
    const chip = screen.getByRole('button', { name: "shot.png: DeepSeek Pro can't see images" })
    expect(chip.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(chip)
    expect(screen.getByTestId('tooltip').textContent).toBe("DeepSeek Pro can't see images")
    fireEvent.click(chip)
    expect(screen.getByTestId('attention-text').textContent).toContain("DeepSeek Pro can't see images. Writer will get the file, not what is in it.")
    fireEvent.click(screen.getByRole('button', { name: 'Use DeepSeek Flash' }))
    expect(onSwitch).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove shot.png' }))
    expect(result.current.items).toHaveLength(0)
  })
})

describe('which model the box warns of', () => {
  const choice = (value: string, label: string, images?: boolean, notWorking?: boolean): ModelChoice =>
    ({ value, label, maker: 'DeepSeek', via: 'via OpenRouter', price: 1, ...(images !== undefined && { images }), ...(notWorking && { notWorking }) })
  const pro = choice('p/pro', 'DeepSeek Pro', false)
  const flash = choice('p/flash', 'DeepSeek Flash', true)

  it('names a model known to read text only, with the first working one that sees images', () => {
    const choices: ModelChoices = { current: 'p/pro', recent: [], models: [pro, choice('p/broken', 'Broken', true, true), flash] }
    expect(textOnlyModel(choices)).toEqual({ model: pro, switchTo: flash })
  })

  it('says nothing for a model that takes images, or one nobody knows', () => {
    expect(textOnlyModel({ current: 'p/flash', recent: [], models: [pro, flash] })).toBeNull()
    expect(textOnlyModel({ current: 'p/x', recent: [], models: [choice('p/x', 'Own endpoint')] })).toBeNull()
    expect(textOnlyModel(undefined)).toBeNull()
  })
})

describe("a person's message with photos and files", () => {
  const message = (body: object) => ({
    id: 'm1', seq: 1, clientMessageId: null, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT', spoken: false,
    interrupted: false, operationId: null, turnId: null, queueState: null, createdAt: new Date().toISOString(), body: { text: '', ...body },
  }) as never

  it('names its files, draws no empty bubble, and says under it when the model could not see the picture', () => {
    render(<PersonBubble agentName="Writer" message={message({ shared: [{ name: 'shot.png', kind: 'image', mime: 'image/png', size: 9 }], unseenBy: 'DeepSeek Pro' })} />)
    expect(screen.getByTestId('shared-in-message').textContent).toContain('shot.png')
    expect(screen.getByTestId('unseen-note').textContent).toBe("DeepSeek Pro couldn't see the image. Writer got the file, not what is in it.")
    expect(document.querySelector('.rounded-2xl')).toBeNull()
  })
})
